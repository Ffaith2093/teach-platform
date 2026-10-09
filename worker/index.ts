/**
 * BullMQ Worker 进程
 *
 * 启动方式：npm run worker
 *
 * 流程：
 *   1. 从 judge 队列取 job
 *   2. 加载 Submission + Problem + TestCases
 *   3. 标记 status=JUDGING
 *   4. 跑 sandbox（按 JUDGE_BACKEND 选 docker / local）
 *   5. 写 Submission + JudgeCase
 *   6. 按 contextType 回写父上下文：
 *      - ASSIGNMENT → AssignmentSubmission.autoScore（重算）
 *      - EXAM       → Answer.autoScore + ExamAttempt.autoScore（重算）
 *      - PRACTICE   → 无回写
 *
 * 进程崩溃 / 单条失败：BullMQ 自动重试 1 次（attempts: 2），二次失败 → status=SYSTEM_ERROR
 */
import { Worker, type Job } from "bullmq";
import { prisma } from "@/lib/prisma";
import { scaledProblemScore } from "@/lib/exams/scoring";
import { JUDGE_QUEUE_NAME, type JudgeJobData, redisConnectionOptions } from "@/lib/judge/queue";
import { runJudge, type JudgeRunResult } from "@/lib/judge/local";
import { runSandbox } from "@/lib/judge/sandbox";
import { scoreAssignmentAnswers, scoreAssignmentProblem } from "@/lib/assignments/scoring";
import { finalizeAutomaticAssignment } from "@/lib/assignments/finalize";

const backend = process.env.JUDGE_BACKEND ?? "docker";
const concurrency = Math.min(6, Math.max(1, parseInt(process.env.JUDGE_CONCURRENCY ?? "6", 10) || 6));
if (backend !== "docker" && (backend !== "local" || process.env.NODE_ENV === "production")) {
  throw new Error("Only the Docker judge is allowed in production");
}

console.log(`[judge-worker] starting backend=${backend} concurrency=${concurrency}`);

const processor = backend === "docker" ? runSandbox : runJudge;

const worker = new Worker<JudgeJobData>(
  JUDGE_QUEUE_NAME,
  async (job: Job<JudgeJobData>) => {
    const { submissionId } = job.data;
    console.log(`[judge-worker] job ${job.id} submission=${submissionId}`);
    try {
      await processSubmission(submissionId, job.attemptsMade > 0);
    } catch (error) {
      if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
        await prisma.submission.updateMany({
          where: { id: submissionId, status: { in: ["PENDING", "JUDGING"] } },
          data: {
            status: "SYSTEM_ERROR",
            errorMsg: (error as Error).message.slice(0, 2000),
          },
        });
        await settleExamAttempt(submissionId);
      }
      throw error;
    }
  },
  {
    connection: redisConnectionOptions(),
    concurrency,
    lockDuration: parseInt(process.env.JUDGE_TOTAL_TIMEOUT_MS ?? "30000", 10) + 30_000,
  },
);

worker.on("completed", (job) => {
  console.log(`[judge-worker] job ${job.id} ✓`);
});
worker.on("failed", (job, err) => {
  console.error(`[judge-worker] job ${job?.id} ✗`, err);
  if (!job) return;
  void job.getState().then(async (state) => {
    if (state !== "failed") return;
    await prisma.submission.updateMany({
      where: { id: job.data.submissionId, status: { in: ["PENDING", "JUDGING"] } },
      data: { status: "SYSTEM_ERROR", errorMsg: err.message.slice(0, 2000) },
    });
  }).catch((error) => console.error("[judge-worker] failed to finalize job:", error));
});

async function processSubmission(submissionId: string, retry: boolean): Promise<void> {
  // 1. 加载 submission（带 problem + testCases）
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      problem: {
        include: {
          testCases: { orderBy: { order: "asc" }, select: { id: true, input: true, expected: true, isSample: true, score: true } },
        },
      },
    },
  });
  if (!submission) {
    console.warn(`[judge-worker] submission ${submissionId} not found, skip`);
    return;
  }
  if (retry && submission.status !== "PENDING" && submission.status !== "JUDGING" && submission.status !== "SYSTEM_ERROR") {
    await propagateToParent(submissionId, submission.score);
    return;
  }
  if (submission.status !== "PENDING" && !(retry && submission.status === "JUDGING")) {
    console.log(`[judge-worker] submission ${submissionId} status=${submission.status}, skip`);
    return;
  }

  // 2. 标记 JUDGING
  await prisma.submission.update({
    where: { id: submissionId },
    data: { status: "JUDGING" },
  });

  // 3. 跑 sandbox
  const problem = submission.problem;
  const result: JudgeRunResult = await processor(
    submission.code,
    problem.testCases.map((tc) => ({
      input: tc.input,
      expected: tc.expected,
      isSample: tc.isSample,
      score: tc.score,
    })),
    {
      timeLimitMs: problem.timeLimitMs,
      memoryLimitMb: problem.memoryLimitMb,
      splitInputByWhitespace: problem.splitInputByWhitespace,
    },
  );
  if (result.status === "SYSTEM_ERROR") {
    throw new Error(result.cases.find((c) => c.errorMsg)?.errorMsg ?? "评测沙箱不可用");
  }

  // 4. 写 Submission + JudgeCase
  await prisma.$transaction(async (tx) => {
    await tx.judgeCase.deleteMany({ where: { submissionId } });
    await tx.submission.update({
      where: { id: submissionId },
      data: {
        status: result.status,
        score: result.totalScore,
        passedCount: result.passedCount,
        totalCount: result.totalCount,
        maxTimeMs: Math.max(0, ...result.cases.map((c) => c.timeMs)),
        errorMsg: result.cases.find((c) => c.errorMsg)?.errorMsg?.slice(0, 2000) ?? null,
      },
    });

    if (problem.testCases.length > 0 && result.cases.length > 0) {
      await tx.judgeCase.createMany({
        data: problem.testCases.map((tc, i) => {
          const c = result.cases[i];
          return {
            submissionId,
            testCaseId: tc.id,
            status: (c?.status ?? "SYSTEM_ERROR") as
              | "PENDING"
              | "JUDGING"
              | "ACCEPTED"
              | "WRONG_ANSWER"
              | "TLE"
              | "MLE"
              | "RUNTIME_ERROR"
              | "COMPILE_ERROR"
              | "SYSTEM_ERROR",
            timeMs: c?.timeMs ?? 0,
            // 仅 sample 返回实际输出（SPEC §3.1 红线）
            actualOutput: tc.isSample ? c?.actualOutput ?? null : null,
          };
        }),
      });
    }
  });

  // 5. 回写父上下文
  await propagateToParent(submissionId, result.totalScore);
}

/**
 * 按 submission 的 contextType 把分数回写到父级聚合（AssignmentSubmission / ExamAttempt）
 */
async function propagateToParent(submissionId: string, totalScore: number): Promise<void> {
  const sub = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { contextType: true, contextId: true, userId: true, problemId: true },
  });
  if (!sub || !sub.contextId) return;

  if (sub.contextType === "ASSIGNMENT") {
    // 重新计算 AssignmentSubmission.autoScore = sum(latest submission.score per problem)
    const assignmentId = sub.contextId;
    const studentId = sub.userId;
    const allProblems = await prisma.assignmentProblem.findMany({
      where: { assignmentId },
      select: { problemId: true, score: true },
    });
    let totalAutoScore = 0;
    for (const p of allProblems) {
      const latest = await prisma.submission.findFirst({
        where: {
          problemId: p.problemId,
          userId: studentId,
          contextType: "ASSIGNMENT",
          contextId: assignmentId,
        },
        orderBy: { createdAt: "desc" },
        select: { passedCount: true, totalCount: true },
      });
      totalAutoScore += scoreAssignmentProblem(
        latest?.passedCount ?? 0,
        latest?.totalCount ?? 0,
        p.score,
      );
    }
    const [parent, assignmentQuestions] = await Promise.all([
      prisma.assignmentSubmission.findUnique({
        where: { assignmentId_studentId: { assignmentId, studentId } },
        select: { answers: true },
      }),
      prisma.assignmentQuestion.findMany({
        where: { assignmentId },
        include: { question: { select: { type: true, answer: true } } },
      }),
    ]);
    totalAutoScore += scoreAssignmentAnswers(assignmentQuestions, parent?.answers);
    await prisma.assignmentSubmission.updateMany({
      where: { assignmentId, studentId },
      data: { autoScore: totalAutoScore },
    });
    await finalizeAutomaticAssignment(assignmentId, studentId);
    return;
  }

  if (sub.contextType === "EXAM") {
    // 把 Submission.score 映射到 ExamQuestion.score，写 Answer.autoScore，重算 ExamAttempt.autoScore
    const attemptId = sub.contextId;
    const attempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        exam: {
          include: {
            questions: { select: { questionId: true, score: true, question: { select: { problemId: true, type: true } } } },
          },
        },
      },
    });
    if (!attempt) return;

    // 找到这道编程题对应的 ExamQuestion
    const eq = attempt.exam.questions.find(
      (q) => q.question.problemId === sub.problemId,
    );
    if (!eq || !attempt.questionIds.includes(eq.questionId) || attempt.status === "GRADED") return;

    // 按比例缩放到 ExamQuestion.score
    const problem = await prisma.problem.findUnique({
      where: { id: sub.problemId },
      include: { testCases: { select: { score: true } } },
    });
    if (!problem) return;
    const problemTotal = problem.testCases.reduce((s, tc) => s + tc.score, 0);
    const autoScoreForQuestion = scaledProblemScore(totalScore, problemTotal, eq.score);

    await prisma.$transaction(async (tx) => {
      // 写 Answer.autoScore
      await tx.answer.upsert({
        where: {
          attemptId_questionId: { attemptId, questionId: eq.questionId },
        },
        update: { autoScore: autoScoreForQuestion },
        create: {
          attemptId,
          questionId: eq.questionId,
          autoScore: autoScoreForQuestion,
          content: "" as never, // 内容已在 submitExam 时写；upsert create 仅作兜底
        },
      });
      // 重算 ExamAttempt.autoScore = sum(Answer.autoScore)
      const sum = await tx.answer.aggregate({
        where: { attemptId },
        _sum: { autoScore: true },
      });
      await tx.examAttempt.update({
        where: { id: attemptId },
        data: { autoScore: sum._sum.autoScore ?? 0 },
      });
    });
    await settleExamAttempt(submissionId);
    return;
  }

  // PRACTICE: no parent to update
}

async function settleExamAttempt(submissionId: string): Promise<void> {
  const sub = await prisma.submission.findUnique({ where: { id: submissionId }, select: { contextType: true, contextId: true } });
  if (sub?.contextType !== "EXAM" || !sub.contextId) return;
  const pending = await prisma.submission.count({ where: { contextType: "EXAM", contextId: sub.contextId, status: { in: ["PENDING", "JUDGING"] } } });
  if (!pending) await prisma.examAttempt.updateMany({ where: { id: sub.contextId, status: "SUBMITTED" }, data: { status: "GRADING" } });
}

// 优雅退出
async function shutdown(signal: string) {
  console.log(`[judge-worker] ${signal} received, shutting down...`);
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
