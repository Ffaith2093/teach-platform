"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/guard";

const questionSchema = z.object({
  type: z.enum(["SHORT_TEXT", "SINGLE_CHOICE", "MULTIPLE_CHOICE", "DROPDOWN"]),
  title: z.string().trim().min(1, "问题不能为空").max(500),
  required: z.boolean().default(true),
  options: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
}).superRefine((question, ctx) => {
  if (question.type !== "SHORT_TEXT" && question.options.length < 2) {
    ctx.addIssue({ code: "custom", path: ["options"], message: "选择类问题至少需要两个选项" });
  }
});

const createSurveySchema = z.object({
  courseId: z.string().min(1, "请选择课程"),
  chapterId: z.string().min(1, "请选择章节"),
  title: z.string().trim().min(1, "问卷标题不能为空").max(100),
  description: z.string().trim().max(2000).optional(),
  dueAt: z.string().optional(),
  questions: z.array(questionSchema).min(1, "请至少添加一个问题").max(100),
  intent: z.enum(["draft", "publish"]),
});

export type CreateSurveyState = { error?: string; fieldErrors?: Record<string, string> };

async function requireSurveyCourse(courseId: string) {
  const session = await requireSession();
  if (session.user.role !== "TEACHER") throw new Error("仅教师可管理问卷");
  const member = await prisma.courseTeacher.findUnique({
    where: { courseId_teacherId: { courseId, teacherId: session.user.id } },
    select: { role: true },
  });
  if (!member || (member.role !== "OWNER" && member.role !== "ASSISTANT")) {
    throw new Error("仅课程主讲或助教可管理问卷");
  }
  return session;
}

async function requireSurveyAccess(surveyId: string) {
  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    select: { id: true, courseId: true, status: true },
  });
  if (!survey) throw new Error("问卷不存在");
  const session = await requireSurveyCourse(survey.courseId);
  return { survey, session };
}

export async function createSurveyAction(
  _previous: CreateSurveyState,
  formData: FormData,
): Promise<CreateSurveyState> {
  let questions: unknown = [];
  try {
    questions = JSON.parse(String(formData.get("questions") ?? "[]"));
  } catch {
    return { fieldErrors: { questions: "问题数据格式错误" } };
  }

  const parsed = createSurveySchema.safeParse({
    courseId: formData.get("courseId"),
    chapterId: formData.get("chapterId"),
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    dueAt: formData.get("dueAt") || undefined,
    questions,
    intent: formData.get("intent"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0] ?? "_")] = issue.message;
    return { error: "请检查问卷内容", fieldErrors };
  }

  let session;
  try {
    session = await requireSurveyCourse(parsed.data.courseId);
  } catch (error) {
    return { error: (error as Error).message };
  }
  const chapter = await prisma.chapter.findFirst({
    where: { id: parsed.data.chapterId, courseId: parsed.data.courseId },
    select: { id: true },
  });
  if (!chapter) return { fieldErrors: { chapterId: "所选章节不属于该课程" } };

  const dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) return { fieldErrors: { dueAt: "截止时间无效" } };

  const survey = await prisma.survey.create({
    data: {
      courseId: parsed.data.courseId,
      chapterId: parsed.data.chapterId,
      creatorId: session.user.id,
      title: parsed.data.title,
      description: parsed.data.description || null,
      dueAt,
      status: parsed.data.intent === "publish" ? "PUBLISHED" : "DRAFT",
      questions: {
        create: parsed.data.questions.map((question, order) => ({
          type: question.type,
          title: question.title,
          required: question.required,
          options: question.type === "SHORT_TEXT" ? undefined : question.options,
          order,
        })),
      },
    },
    select: { id: true },
  });
  redirect(`/t/surveys/${survey.id}`);
}

export async function changeSurveyStatusAction(
  surveyId: string,
  status: "DRAFT" | "PUBLISHED" | "CLOSED",
) {
  const { survey } = await requireSurveyAccess(surveyId);
  await prisma.survey.update({ where: { id: survey.id }, data: { status } });
  revalidatePath("/t/surveys");
  revalidatePath(`/t/surveys/${surveyId}`);
  revalidatePath("/surveys");
}

export async function deleteSurveyAction(surveyId: string) {
  const { survey } = await requireSurveyAccess(surveyId);
  await prisma.survey.delete({ where: { id: survey.id } });
  revalidatePath("/t/surveys");
  redirect("/t/surveys");
}
