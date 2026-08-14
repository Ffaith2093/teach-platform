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

  // 加载学生作答
  const answers = await prisma.answer.findMany({
    where: { attemptId },
    select: { questionId: true, content: true },
  });
  const answerByQid = new Map(answers.map((a) => [a.questionId, a.content]));

  let totalAuto = 0;
  const answerUpdates: Array<{ questionId: string; autoScore: number }> = [];
  const programmingEnqueues: Array<{ submissionId: string }> = [];

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
        // PROGRAMMING 题：异步判分（写 PENDING Submission + 入队）
        if (q.problemId) {
          const code = typeof ans === "string" ? ans : "";
          if (code.trim()) {
            const sub = await prisma.submission.create({
              data: {
                problemId: q.problemId,
                userId: attempt.studentId,
                code,
                status: "PENDING",
                contextType: "EXAM",
                contextId: attempt.id,
              },
              select: { id: true, totalCount: true },
            });
            // 取测试用例数量填到 totalCount（Worker 会更新）
            const tcCount = await prisma.testCase.count({
              where: { problemId: q.problemId },
            });
            await prisma.submission.update({
              where: { id: sub.id },
              data: { totalCount: tcCount },
            });
            programmingEnqueues.push({ submissionId: sub.id });
          }
        }
        // PROGRAMMING 题 autoScore 由 Worker 异步写回，submitExam 时算 0
      }
    }

    if (s > 0) totalAuto += s;
    answerUpdates.push({ questionId: q.id, autoScore: s });
  }

  // 持久化（一个事务）
  await prisma.$transaction(async (tx) => {
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

  // 入队 PROGRAMMING 题评测（失败不影响主流程）
  for (const e of programmingEnqueues) {
    try {
      await addJudgeJob(e.submissionId);
    } catch (err) {
      console.error("[submitExam] addJudgeJob failed:", err);
    }
  }

  return { ok: true, attemptId: attempt.id, totalAuto, isAutoSubmit };
}
