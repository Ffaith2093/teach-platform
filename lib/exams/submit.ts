/**
 * 考试交卷核心逻辑（与提交渠道无关）
 *
 * 用于：
 * 1. 学生手动点「交卷」（submitExamAction 调用）
 * 2. 自动交卷兜底 cron（autoSubmitExpiredAttempts 调用）
 *
 * 副作用只触碰数据库；不做 redirect / revalidatePath / 鉴权。
 * 鉴权由调用方负责（学生路径用 requireSession，cron 路径用 secret header）。
 *
 * PROGRAMMING 题异步判分：写入 PENDING Submission + 入队，Worker 跑完后回写
 * Answer.autoScore + ExamAttempt.autoScore。客观题（SINGLE_CHOICE / FILL_BLANK /
 * CODE_BLANK）仍同步判分。
 */
import { prisma } from "@/lib/prisma";
import { addJudgeJob } from "@/lib/judge/queue";
import type { AttemptStatus } from "@prisma/client";
import { finalExamScore } from "@/lib/exams/scoring";

export type SubmitExamResult =
  | { ok: true; attemptId: string; totalAuto: number; isAutoSubmit: boolean }
  | { ok: false; error: string };

export async function submitExam(attemptId: string): Promise<SubmitExamResult> {
  const attempt = await prisma.examAttempt.findUnique({
    where: { id: attemptId },
    include: {
      exam: {
        include: {
          questions: {
            include: {
              question: {
                select: {
                  id: true,
                  type: true,
                  answer: true,
                  problemId: true,
                },
              },
            },
            orderBy: { order: "asc" },
          },
        },
      },
    },
  });
  if (!attempt) return { ok: false, error: "尝试记录不存在" };

  // 幂等：已交卷 / 批改中 / 已完成 → 直接返回
  if (attempt.status !== "IN_PROGRESS") {
    return {
      ok: true,
      attemptId: attempt.id,
      totalAuto: attempt.autoScore ?? 0,
      isAutoSubmit: attempt.isAutoSubmit,
    };
  }

  const now = new Date();
  const isAutoSubmit = attempt.deadlineAt.getTime() < now.getTime();

  const assigned = new Set(attempt.questionIds);
  const actualQuestions = attempt.exam.questions.filter((eq) => assigned.has(eq.questionId));
  if (actualQuestions.length !== assigned.size) return { ok: false, error: "试卷题目缺失，请联系教师" };

  const graded = await prisma.$transaction(async (tx) => {
    const claimed = await tx.examAttempt.updateMany({
      where: { id: attempt.id, status: "IN_PROGRESS" },
      data: { status: "SUBMITTED" },
    });
    if (!claimed.count) return null;
    const answers = await tx.answer.findMany({
    where: { attemptId },
    select: { questionId: true, content: true },
  });
  const answerByQid = new Map(answers.map((a) => [a.questionId, a.content]));

  let totalAuto = 0;
  const answerUpdates: Array<{ questionId: string; autoScore: number }> = [];
  const programmingAnswers: Array<{ problemId: string; code: string; totalCount: number }> = [];

  for (const eq of actualQuestions) {
    const q = eq.question;
    const ans = answerByQid.get(q.id);
    let s = 0;

    if (ans !== undefined && ans !== null) {
      if (q.type === "SINGLE_CHOICE") {
        s = ans === q.answer ? eq.score : 0;
      } else if (q.type === "FILL_BLANK" || q.type === "CODE_BLANK") {
        const expected = Array.isArray(q.answer) ? (q.answer as string[]) : [];
        const given = Array.isArray(ans) ? (ans as string[]) : [];
        if (expected.length > 0 && expected.length === given.length) {
          const norm = (x: string) => x.replace(/\s+$/, "").trim();
          const allMatch = expected.every((e, i) => norm(given[i] ?? "") === norm(e));
          s = allMatch ? eq.score : 0;
        }
      } else if (q.type === "PROGRAMMING") {
        // PROGRAMMING 题：异步判分（写 PENDING Submission + 入队）
        if (q.problemId) {
          const code = typeof ans === "string" ? ans : "";
          if (code.trim()) {
            const tcCount = await tx.testCase.count({
              where: { problemId: q.problemId },
            });
            programmingAnswers.push({ problemId: q.problemId, code, totalCount: tcCount });
          }
        }
        // PROGRAMMING 题 autoScore 由 Worker 异步写回，submitExam 时算 0
      }
    }

    if (s > 0) totalAuto += s;
    answerUpdates.push({ questionId: q.id, autoScore: s });
  }

    for (const u of answerUpdates) {
      const existing = await tx.answer.findUnique({
        where: {
          attemptId_questionId: { attemptId: attempt.id, questionId: u.questionId },
        },
      });
      if (existing) {
        await tx.answer.update({
          where: { id: existing.id },
          data: { autoScore: u.autoScore },
        });
      }
    }
    const submissions: Array<{ submissionId: string }> = [];
    for (const answer of programmingAnswers) {
      const submission = await tx.submission.create({
        data: {
          ...answer,
          userId: attempt.studentId,
          status: "PENDING",
          contextType: "EXAM",
          contextId: attempt.id,
        },
        select: { id: true },
      });
      submissions.push({ submissionId: submission.id });
    }
    await tx.examAttempt.update({
      where: { id: attempt.id },
      data: {
        status: (submissions.length ? "SUBMITTED" : "GRADED") as AttemptStatus,
        submittedAt: now,
        autoScore: totalAuto,
        finalScore: submissions.length
          ? null
          : finalExamScore(answerUpdates.map((u) => ({ autoScore: u.autoScore, manualScore: null })), attempt.exam.totalScore),
        isAutoSubmit,
      },
    });
    return { submissions, totalAuto };
  }, { timeout: 30000 });
  if (!graded) {
    const current = await prisma.examAttempt.findUniqueOrThrow({ where: { id: attemptId }, select: { autoScore: true, isAutoSubmit: true } });
    return { ok: true, attemptId, totalAuto: current.autoScore ?? 0, isAutoSubmit: current.isAutoSubmit };
  }
  const { submissions: programmingEnqueues, totalAuto } = graded;

  // 入队 PROGRAMMING 题评测（失败不影响主流程）
  for (const e of programmingEnqueues) {
    try {
      await addJudgeJob(e.submissionId);
    } catch (err) {
      console.error("[submitExam] addJudgeJob failed:", err);
      await prisma.submission.update({
        where: { id: e.submissionId },
        data: { status: "SYSTEM_ERROR", errorMsg: "评测队列暂时不可用" },
      });
    }
  }
  if (programmingEnqueues.length) {
    const pending = await prisma.submission.count({
      where: { id: { in: programmingEnqueues.map((e) => e.submissionId) }, status: { in: ["PENDING", "JUDGING"] } },
    });
    if (!pending) await prisma.examAttempt.updateMany({ where: { id: attemptId, status: "SUBMITTED" }, data: { status: "GRADING" } });
  }

  return { ok: true, attemptId: attempt.id, totalAuto, isAutoSubmit };
}
