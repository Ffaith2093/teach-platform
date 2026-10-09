"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/guard";

const submitSchema = z.object({ surveyId: z.string().min(1), answers: z.record(z.unknown()) });
export type SubmitSurveyState = { ok?: true; error?: string };

export async function submitSurveyResponseAction(
  _previous: SubmitSurveyState,
  formData: FormData,
): Promise<SubmitSurveyState> {
  const session = await requireSession();
  if (session.user.role !== "STUDENT") return { error: "仅学生可提交问卷" };
  let rawAnswers: unknown;
  try {
    rawAnswers = JSON.parse(String(formData.get("answers") ?? "{}"));
  } catch {
    return { error: "回答数据格式错误" };
  }
  const parsed = submitSchema.safeParse({ surveyId: formData.get("surveyId"), answers: rawAnswers });
  if (!parsed.success) return { error: "回答数据格式错误" };

  const student = await prisma.user.findUnique({ where: { id: session.user.id }, select: { classId: true } });
  if (!student?.classId) return { error: "您尚未分班" };
  const survey = await prisma.survey.findFirst({
    where: {
      id: parsed.data.surveyId,
      status: "PUBLISHED",
      course: { classes: { some: { classId: student.classId } } },
    },
    include: { questions: { orderBy: { order: "asc" } } },
  });
  if (!survey) return { error: "问卷不存在或未开放" };
  if (survey.dueAt && survey.dueAt < new Date()) return { error: "问卷已超过截止时间" };

  const normalized: Record<string, string | string[]> = {};
  for (const question of survey.questions) {
    const value = parsed.data.answers[question.id];
    const options = Array.isArray(question.options) ? question.options.map(String) : [];
    if (question.type === "MULTIPLE_CHOICE") {
      const selected = Array.isArray(value) ? [...new Set(value.map(String).filter((item) => options.includes(item)))] : [];
      if (question.required && selected.length === 0) return { error: `请回答第 ${question.order + 1} 题` };
      normalized[question.id] = selected;
    } else {
      const answer = String(value ?? "").trim();
      if (question.required && !answer) return { error: `请回答第 ${question.order + 1} 题` };
      if (question.type !== "SHORT_TEXT" && answer && !options.includes(answer)) return { error: `第 ${question.order + 1} 题选项无效` };
      normalized[question.id] = answer.slice(0, 5000);
    }
  }

  await prisma.surveyResponse.upsert({
    where: { surveyId_studentId: { surveyId: survey.id, studentId: session.user.id } },
    create: { surveyId: survey.id, studentId: session.user.id, answers: normalized },
    update: { answers: normalized, submittedAt: new Date() },
  });
  revalidatePath("/surveys");
  revalidatePath(`/surveys/${survey.id}`);
  revalidatePath(`/courses/${survey.courseId}/chapters/${survey.chapterId}`);
  return { ok: true };
}
