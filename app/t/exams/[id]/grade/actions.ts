"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireExamAccess } from "@/app/t/exams/actions";
import { finalExamScore } from "@/lib/exams/scoring";

const gradeItemSchema = z.object({
  questionId: z.string().min(1),
  manualScore: z.coerce.number().int().min(0, "分数不能小于 0").max(9999, "分数过大"),
  comment: z.string().max(500, "评语不超过 500 字").optional().or(z.literal("")),
});

const gradeAttemptSchema = z.object({
  attemptId: z.string().min(1),
  grades: z.array(gradeItemSchema).min(1, "至少一道题需要评分"),
});

export type GradeAttemptState = {
  error?: string;
  ok?: boolean;
  saved?: number;
};

export async function gradeAttemptAction(
  attemptId: string,
  _prev: GradeAttemptState | undefined,
  formData: FormData,
): Promise<GradeAttemptState> {
  const gradesJson = formData.get("grades");
  if (typeof gradesJson !== "string") {
    return { error: "缺少评分数据" };
  }
  let grades: unknown;
  try {
    grades = JSON.parse(gradesJson);
  } catch {
    return { error: "评分数据格式错误" };
  }
  const parsed = gradeAttemptSchema.safeParse({ attemptId, grades });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "请检查输入" };
  }

  const attempt = await prisma.examAttempt.findUnique({
    where: { id: attemptId },
    select: { id: true, examId: true, status: true, questionIds: true },
  });
  if (!attempt) return { error: "尝试记录不存在" };
  if (attempt.status !== "GRADING") {
    return { error: "该尝试不在可批改状态" };
  }

  const { session } = await requireExamAccess(attempt.examId, "ASSISTANT");
  const teacherId = session.user.id;

  const examQuestions = await prisma.examQuestion.findMany({
    where: { examId: attempt.examId },
    select: { questionId: true, score: true },
  });
  const maxByQid = new Map(examQuestions.map((eq) => [eq.questionId, eq.score]));
  for (const g of parsed.data.grades) {
    if (!attempt.questionIds.includes(g.questionId)) return { error: "题目不属于本次考试" };
    const max = maxByQid.get(g.questionId);
    if (max === undefined) return { error: "题目不属于本试卷" };
    if (g.manualScore > max) {
      return { error: `手动分不能超过满分 ${max}` };
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const g of parsed.data.grades) {
      const existing = await tx.answer.findUnique({
        where: { attemptId_questionId: { attemptId, questionId: g.questionId } },
      });
      if (existing) {
        await tx.answer.update({
          where: { id: existing.id },
          data: {
            manualScore: g.manualScore,
            comment: g.comment && g.comment.length > 0 ? g.comment : null,
            gradedById: teacherId,
          },
        });
      } else {
        // 学生没作答却给了分（极少见，但允许）
        await tx.answer.create({
          data: {
            attemptId,
            questionId: g.questionId,
            content: null as never,
            manualScore: g.manualScore,
            comment: g.comment && g.comment.length > 0 ? g.comment : null,
            gradedById: teacherId,
          },
        });
      }
    }
    const allAnswers = await tx.answer.findMany({ where: { attemptId }, select: { autoScore: true, manualScore: true } });
    const manualTotal = allAnswers.reduce((s, a) => s + (a.manualScore ?? 0), 0);
    await tx.examAttempt.update({
      where: { id: attemptId },
      data: { status: "GRADING", manualScore: manualTotal },
    });
  });

  revalidatePath(`/t/exams/${attempt.examId}/grade`);
  revalidatePath(`/t/exams/${attempt.examId}/grade/${attemptId}`);
  return { ok: true, saved: parsed.data.grades.length };
}

const publishAttemptSchema = z.object({ attemptId: z.string().min(1) });
export type PublishAttemptState = { error?: string; ok?: boolean };

export async function publishAttemptAction(
  attemptId: string,
): Promise<PublishAttemptState> {
  const parsed = publishAttemptSchema.safeParse({ attemptId });
  if (!parsed.success) return { error: "缺少 attemptId" };

  const attempt = await prisma.examAttempt.findUnique({
    where: { id: parsed.data.attemptId },
    select: { id: true, examId: true, status: true },
  });
  if (!attempt) return { error: "尝试记录不存在" };
  if (attempt.status !== "GRADING") return { error: "仅「批改中」可发布" };

  await requireExamAccess(attempt.examId, "OWNER");
  const examMeta = await prisma.exam.findUnique({
    where: { id: attempt.examId },
    select: { totalScore: true },
  });
  if (!examMeta) return { error: "试卷不存在" };
  const finalScore = await recomputeFinalScore(parsed.data.attemptId, examMeta.totalScore);

  await prisma.examAttempt.update({
    where: { id: parsed.data.attemptId },
    data: { status: "GRADED", finalScore },
  });

  revalidatePath(`/t/exams/${attempt.examId}/grade`);
  revalidatePath(`/t/exams/${attempt.examId}/grade/${parsed.data.attemptId}`);
  revalidatePath(`/exams/${attempt.examId}`);
  return { ok: true };
}

const publishAllSchema = z.object({ examId: z.string().min(1) });

export async function publishAllGradedAction(
  examId: string,
): Promise<PublishAttemptState & { count?: number }> {
  const parsed = publishAllSchema.safeParse({ examId });
  if (!parsed.success) return { error: "缺少 examId" };

  const { exam } = await requireExamAccess(parsed.data.examId, "OWNER");
  const examMeta = await prisma.exam.findUnique({
    where: { id: parsed.data.examId },
    select: { totalScore: true },
  });
  if (!examMeta) return { error: "试卷不存在" };

  const attempts = await prisma.examAttempt.findMany({
    where: { examId: parsed.data.examId, status: "GRADING" },
    select: { id: true },
  });
  if (attempts.length === 0) return { ok: true, count: 0 };

  for (const a of attempts) {
    const fs = await recomputeFinalScore(a.id, examMeta.totalScore);
    await prisma.examAttempt.updateMany({ where: { id: a.id, status: "GRADING" }, data: { status: "GRADED", finalScore: fs } });
  }

  revalidatePath(`/t/exams/${parsed.data.examId}/grade`);
  revalidatePath(`/t/exams/${parsed.data.examId}`);
  for (const a of attempts) {
    revalidatePath(`/exams/${parsed.data.examId}`);
  }
  return { ok: true, count: attempts.length };
}

const reopenSchema = z.object({ attemptId: z.string().min(1) });

export async function reopenAttemptAction(
  attemptId: string,
): Promise<PublishAttemptState> {
  const parsed = reopenSchema.safeParse({ attemptId });
  if (!parsed.success) return { error: "缺少 attemptId" };

  const attempt = await prisma.examAttempt.findUnique({
    where: { id: parsed.data.attemptId },
    select: { id: true, examId: true, status: true },
  });
  if (!attempt) return { error: "尝试记录不存在" };
  if (attempt.status !== "GRADED") return { error: "仅「已发布」可重新打开" };

  await requireExamAccess(attempt.examId, "OWNER");

  await prisma.examAttempt.update({
    where: { id: parsed.data.attemptId },
    data: { status: "GRADING", finalScore: null },
  });

  revalidatePath(`/t/exams/${attempt.examId}/grade`);
  revalidatePath(`/t/exams/${attempt.examId}/grade/${parsed.data.attemptId}`);
  revalidatePath(`/exams/${attempt.examId}`);
  return { ok: true };
}

// ========== helpers ==========

async function recomputeFinalScore(attemptId: string, totalScore: number): Promise<number> {
  const answers = await prisma.answer.findMany({
    where: { attemptId },
    select: { autoScore: true, manualScore: true },
  });
  return finalExamScore(answers, totalScore);
}
