"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/guard";
import { submitExam } from "@/lib/exams/submit";
import { recordAccess } from "@/lib/access-log";
import { drawQuestionIds, drawRulesSchema } from "@/lib/exams/rules";
import { Prisma } from "@prisma/client";

async function requireStudent() {
  const session = await requireSession();
  if (session.user.role !== "STUDENT") {
    throw new Error("仅学生可参加考试");
  }
  return session;
}

// ========== 开始考试 ==========

export async function startExamAction(examId: string) {
  const session = await requireStudent();
  const studentId = session.user.id;

  const me = await prisma.user.findUnique({
    where: { id: studentId },
    select: { classId: true },
  });
  if (!me?.classId) throw new Error("您尚未分配班级");

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      questions: {
        include: {
          question: { select: { id: true } },
        },
        orderBy: { order: "asc" },
      },
    },
  });
  if (!exam) throw new Error("试卷不存在");

  // 必须 published 且在窗口期内
  const now = new Date();
  if (exam.status !== "PUBLISHED") throw new Error("试卷当前不可参加");
  if (exam.openAt > now) throw new Error("考试尚未开始");
  if (exam.closeAt < now) throw new Error("考试已结束");

  // 学生班级必须在课程班级列表里
  const accessible = await prisma.courseClass.count({
    where: { courseId: exam.courseId, classId: me.classId },
  });
  if (accessible === 0) throw new Error("您不在本课程关联的班级中");

  // 已存在 attempt？
  const existing = await prisma.examAttempt.findUnique({
    where: { examId_studentId: { examId, studentId } },
  });
  if (existing) {
    // 已交卷不能再开
    if (existing.status !== "IN_PROGRESS") {
      throw new Error("您已交卷或已完成批改，无法再次参加");
    }
    redirect(`/exams/${examId}/attempt/${existing.id}`);
  }

  // 抽题 + 乱序
  let pickedIds: string[];
  if (exam.drawRules) {
    const config = drawRulesSchema.safeParse(exam.drawRules);
    if (!config.success) throw new Error("抽题规则无效，请联系教师");
    const poolIds = new Set(exam.questions.map((eq) => eq.questionId));
    pickedIds = drawQuestionIds(config.data);
    if (pickedIds.some((id) => !poolIds.has(id))) throw new Error("抽题池不完整，请联系教师");
    if (exam.shuffleQuestion) pickedIds = shuffle(pickedIds);
  } else if (exam.questions.length > 0) {
    const allIds = exam.questions.map((eq) => eq.questionId);
    pickedIds = exam.shuffleQuestion ? shuffle(allIds) : allIds;
  } else {
    pickedIds = [];
  }

  if (!pickedIds.length) throw new Error("试卷尚未配置题目");
  const deadlineAt = new Date(Math.min(exam.closeAt.getTime(), now.getTime() + exam.durationMin * 60 * 1000));

  let attempt;
  try {
    attempt = await prisma.examAttempt.create({
    data: {
      examId,
      studentId,
      questionIds: pickedIds,
      startedAt: now,
      deadlineAt,
      status: "IN_PROGRESS",
    },
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    attempt = await prisma.examAttempt.findUniqueOrThrow({ where: { examId_studentId: { examId, studentId } } });
    if (attempt.status !== "IN_PROGRESS") throw new Error("您已交卷，无法再次参加");
  }

  redirect(`/exams/${examId}/attempt/${attempt.id}`);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ========== 保存答案 ==========

const saveAnswerSchema = z.object({
  attemptId: z.string().min(1),
  questionId: z.string().min(1),
  content: z.string().min(1).max(200000),
});

export type SaveAnswerState = {
  error?: string;
  ok?: boolean;
};

export async function saveAnswerAction(
  _prev: SaveAnswerState | undefined,
  formData: FormData,
): Promise<SaveAnswerState> {
  const session = await requireStudent();
  const studentId = session.user.id;

  const parsed = saveAnswerSchema.safeParse({
    attemptId: formData.get("attemptId"),
    questionId: formData.get("questionId"),
    content: formData.get("content"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "请检查输入" };
  }

  const attempt = await prisma.examAttempt.findUnique({
    where: { id: parsed.data.attemptId },
    select: { id: true, studentId: true, status: true, deadlineAt: true, examId: true, questionIds: true, exam: { select: { closeAt: true } } },
  });
  if (!attempt) return { error: "尝试记录不存在" };
  if (attempt.studentId !== studentId) return { error: "无权访问" };
  if (attempt.status !== "IN_PROGRESS") {
    return { error: "已交卷，无法保存" };
  }
  if (Math.min(attempt.deadlineAt.getTime(), attempt.exam.closeAt.getTime()) < Date.now()) {
    return { error: "已超过截止时间，请提交" };
  }
  if (!attempt.questionIds.includes(parsed.data.questionId)) return { error: "题目不属于本次考试" };
  const question = await prisma.examQuestion.findUnique({
    where: { examId_questionId: { examId: attempt.examId, questionId: parsed.data.questionId } },
    select: { question: { select: { type: true, options: true } } },
  });
  if (!question) return { error: "题目不存在" };

  // content 是 JSON 字符串
  let jsonContent: unknown;
  try { jsonContent = JSON.parse(parsed.data.content); } catch { return { error: "答案格式错误" }; }
  const { type, options } = question.question;
  if (type === "SINGLE_CHOICE" && (typeof jsonContent !== "string" ||
      (jsonContent !== "" && !(Array.isArray(options) && options.some((o) => typeof o === "object" && o !== null && "key" in o && o.key === jsonContent))))) {
    return { error: "选项无效" };
  }
  if ((type === "FILL_BLANK" || type === "CODE_BLANK") &&
      (!Array.isArray(jsonContent) || jsonContent.length > 30 || jsonContent.some((v) => typeof v !== "string" || v.length > 2000))) {
    return { error: "填空答案无效" };
  }
  if (type === "PROGRAMMING" && (typeof jsonContent !== "string" || jsonContent.length > 100000)) return { error: "代码内容无效" };

  const saved = await prisma.$transaction(async (tx) => {
    const claim = await tx.examAttempt.updateMany({
      where: { id: attempt.id, status: "IN_PROGRESS", deadlineAt: { gte: new Date() } },
      data: { status: "IN_PROGRESS" },
    });
    if (!claim.count) return false;
    await tx.answer.upsert({
      where: { attemptId_questionId: { attemptId: attempt.id, questionId: parsed.data.questionId } },
      update: { content: jsonContent as never },
      create: { attemptId: attempt.id, questionId: parsed.data.questionId, content: jsonContent as never },
    });
    return true;
  });
  if (!saved) return { error: "已交卷或已超过截止时间，无法保存" };
  revalidatePath(`/exams/${attempt.examId}/attempt/${parsed.data.attemptId}`);
  return { ok: true };
}

// ========== 交卷 ==========

const submitSchema = z.object({
  attemptId: z.string().min(1),
});

export type SubmitExamState = {
  error?: string;
  ok?: boolean;
};

export async function submitExamAction(
  _prev: SubmitExamState | undefined,
  formData: FormData,
): Promise<SubmitExamState> {
  const session = await requireStudent();
  const studentId = session.user.id;

  const parsed = submitSchema.safeParse({
    attemptId: formData.get("attemptId"),
  });
  if (!parsed.success) return { error: "缺少 attemptId" };

  // 鉴权：只有 attempt 的本人能提交
  const attempt = await prisma.examAttempt.findUnique({
    where: { id: parsed.data.attemptId },
    select: { id: true, studentId: true, examId: true, exam: { select: { courseId: true } } },
  });
  if (!attempt) return { error: "尝试记录不存在" };
  if (attempt.studentId !== studentId) return { error: "无权访问" };

  const result = await submitExam(parsed.data.attemptId);
  if (!result.ok) return { error: result.error };

  // 出勤打点：交卷算一次 AccessLog
  void recordAccess({
    userId: studentId,
    courseId: attempt.exam.courseId,
  });

  revalidatePath(`/exams/${attempt.examId}`);
  revalidatePath(`/exams/${attempt.examId}/attempt/${parsed.data.attemptId}`);
  redirect(`/exams/${attempt.examId}`);
}
