/**
 * 考试交卷核心逻辑（与提交渠道无关）
 *
 * 用于：
 * 1. 学生手动点「交卷」（submitExamAction 调用）
 * 2. 自动交卷兜底 cron（autoSubmitExpiredAttempts 调用）
 *
 * 副作用只触碰数据库；不做 redirect / revalidatePath / 鉴权。
 * 鉴权由调用方负责（学生路径用 requireSession，cron 路径用 secret header）。
 */
import { prisma } from "@/lib/prisma";
import { runJudge } from "@/lib/judge/local";
import type { AttemptStatus } from "@prisma/client";

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

  // 幂等：已交卷 / 批改中 / 已完成 → 直接返回，不再处理
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

  // 加载学生作答
  const answers = await prisma.answer.findMany({
    where: { attemptId },
    select: { questionId: true, content: true },
  });
  const answerByQid = new Map(answers.map((a) => [a.questionId, a.content]));

  // 一次性把 PROGRAMMING 题目对应的 Problem + TestCase 拉出来（避免 N+1）
  const programmingProblemIds = attempt.exam.questions
    .filter((eq) => eq.question.type === "PROGRAMMING" && eq.question.problemId)
    .map((eq) => eq.question.problemId as string);
  const problems =
    programmingProblemIds.length > 0
      ? await prisma.problem.findMany({
          where: { id: { in: programmingProblemIds } },
          include: {
            testCases: { select: { input: true, expected: true, score: true } },
          },
        })
      : [];
  const problemById = new Map(problems.map((p) => [p.id, p]));

  let totalAuto = 0;
  const updates: Array<{ questionId: string; autoScore: number }> = [];

  for (const eq of attempt.exam.questions) {
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
        // PROGRAMMING 题：取关联 Problem，跑 runJudge，按测试用例通过率缩放到 ExamQuestion.score
        if (q.problemId) {
          const problem = problemById.get(q.problemId);
          const code = typeof ans === "string" ? ans : "";
          if (problem && code.trim()) {
            const judge = await runJudge(
              code,
              problem.testCases.map((tc) => ({
                input: tc.input,
                expected: tc.expected,
                score: tc.score,
              })),
              { timeLimitMs: problem.timeLimitMs, memoryLimitMb: problem.memoryLimitMb },
            );
            const problemTotal = problem.testCases.reduce((sum, tc) => sum + tc.score, 0);
            const ratio = problemTotal > 0 ? judge.totalScore / problemTotal : 0;
            s = Math.max(0, Math.min(eq.score, Math.round(eq.score * ratio)));
          }
        }
      }
    }

    if (s > 0) totalAuto += s;
    updates.push({ questionId: q.id, autoScore: s });
  }

  // 持久化（一个事务）
  await prisma.$transaction(async (tx) => {
    for (const u of updates) {
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
    await tx.examAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "SUBMITTED" as AttemptStatus,
        submittedAt: now,
        autoScore: totalAuto,
        isAutoSubmit,
      },
    });
  });

  return { ok: true, attemptId: attempt.id, totalAuto, isAutoSubmit };
}