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
import { JUDGE_QUEUE_NAME, type JudgeJobData, redisConnectionOptions } from "@/lib/judge/queue";
import { runJudge, type JudgeRunResult } from "@/lib/judge/local";
import { runSandbox } from "@/lib/judge/sandbox";

const backend = process.env.JUDGE_BACKEND ?? "docker";
const concurrency = parseInt(process.env.JUDGE_CONCURRENCY ?? "6", 10);

console.log(`[judge-worker] starting backend=${backend} concurrency=${concurrency}`);

const processor = backend === "docker" ? runSandbox : runJudge;

const worker = new Worker<JudgeJobData>(
  JUDGE_QUEUE_NAME,
  async (job: Job<JudgeJobData>) => {
    const { submissionId } = job.data;
    console.log(`[judge-worker] job ${job.id} submission=${submissionId}`);
    await processSubmission(submissionId);
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
});

async function processSubmission(submissionId: string): Promise<void> {
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
  if (submission.status !== "PENDING") {
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
    { timeLimitMs: problem.timeLimitMs, memoryLimitMb: problem.memoryLimitMb },
  );

  // 4. 写 Submission + JudgeCase
  await prisma.$transaction(async (tx) => {
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
  await propagateToParent(submissionId, result);
}

/**
 * 按 submission 的 contextType 把分数回写到父级聚合（AssignmentSubmission / ExamAttempt）
 */
async function propagateToParent(submissionId: string, result: JudgeRunResult): Promise<void> {
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
        select: { score: true },
      });
      totalAutoScore += latest?.score ?? 0;
    }
    await prisma.assignmentSubmission.updateMany({
      where: { assignmentId, studentId },
      data: { autoScore: totalAutoScore },
    });
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
    if (!eq) return;

    // 按比例缩放到 ExamQuestion.score
    const problem = await prisma.problem.findUnique({
      where: { id: sub.problemId },
      include: { testCases: { select: { score: true } } },
    });
    if (!problem) return;
    const problemTotal = problem.testCases.reduce((s, tc) => s + tc.score, 0);
    const ratio = problemTotal > 0 ? result.totalScore / problemTotal : 0;
    const autoScoreForQuestion = Math.max(
      0,
      Math.min(eq.score, Math.round(eq.score * ratio)),
    );

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
    return;
  }

  // PRACTICE: no parent to update
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
