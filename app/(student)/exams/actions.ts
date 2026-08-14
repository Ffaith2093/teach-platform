"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/guard";
import type { AttemptStatus, QuestionType } from "@prisma/client";

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
  if (exam.questions.length > 0) {
    const allIds = exam.questions.map((eq) => eq.questionId);
    pickedIds = exam.shuffleQuestion ? shuffle(allIds) : allIds;
  } else {
    pickedIds = [];
  }

  const deadlineAt = new Date(now.getTime() + exam.durationMin * 60 * 1000);

  const attempt = await prisma.examAttempt.create({
    data: {
      examId,
      studentId,
      questionIds: pickedIds,
      startedAt: now,
      deadlineAt,
      status: "IN_PROGRESS",
    },
  });

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
  content: z.string().min(1, "答案为空"),
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
    select: { id: true, studentId: true, status: true, deadlineAt: true, examId: true },
  });
  if (!attempt) return { error: "尝试记录不存在" };
  if (attempt.studentId !== studentId) return { error: "无权访问" };
  if (attempt.status !== "IN_PROGRESS") {
    return { error: "已交卷，无法保存" };
  }
  if (attempt.deadlineAt.getTime() < Date.now()) {
    return { error: "已超过截止时间，请提交" };
  }

  // content 是 JSON 字符串
  let jsonContent: unknown;
  try {
    jsonContent = JSON.parse(parsed.data.content);
  } catch {
    jsonContent = parsed.data.content;
  }

  // upsert
  const existing = await prisma.answer.findUnique({
    where: { attemptId_questionId: { attemptId: parsed.data.attemptId, questionId: parsed.data.questionId } },
  });
  if (existing) {
    await prisma.answer.update({
      where: { id: existing.id },
      data: { content: jsonContent as never },
    });
  } else {
    await prisma.answer.create({
      data: {
        attemptId: parsed.data.attemptId,
        questionId: parsed.data.questionId,
        content: jsonContent as never,
      },
    });
  }
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

  const attempt = await prisma.examAttempt.findUnique({
    where: { id: parsed.data.attemptId },
    include: {
      exam: {
        include: {
          questions: {
            include: {
              question: { select: { id: true, type: true, answer: true } },
            },
          },
        },
      },
    },
  });
  if (!attempt) return { error: "尝试记录不存在" };
  if (attempt.studentId !== studentId) return { error: "无权访问" };
  if (attempt.status !== "IN_PROGRESS") {
    return { ok: true }; // 已交卷视作幂等
  }

  // 自动判分（编程题交 0 分，由 P5.3 教师人工判）
  const scoreByQuestionId = new Map<string, number>();
  const scoreByQuestionIdList = attempt.exam.questions.map((eq) => {
    const correct = eq.question.answer;
    if (correct == null) return { qid: eq.questionId, score: 0 };
    if (eq.question.type === "SINGLE_CHOICE") {
      scoreByQuestionId.set(eq.questionId, eq.score);
      return { qid: eq.questionId, score: eq.score };
    }
    return { qid: eq.questionId, score: eq.score };
  });

  // 取已作答
  const answers = await prisma.answer.findMany({
    where: { attemptId: parsed.data.attemptId },
    select: { questionId: true, content: true },
  });
  const answerByQid = new Map(answers.map((a) => [a.questionId, a.content]));

  let totalAuto = 0;
  const updates: Array<{ id?: string; questionId: string; autoScore: number }> = [];
  for (const eq of attempt.exam.questions) {
    const q = eq.question;
    const eqQuestionId = q.id;
    const ans = answerByQid.get(eqQuestionId);
    let s = 0;
    if (ans !== undefined && ans !== null) {
      if (q.type === "SINGLE_CHOICE") {
        s = ans === q.answer ? eq.score : 0;
      } else if (q.type === "FILL_BLANK" || q.type === "CODE_BLANK") {
        const expected = Array.isArray(q.answer) ? (q.answer as string[]) : [];
        const given = Array.isArray(ans) ? (ans as string[]) : [];
        if (expected.length > 0 && expected.length === given.length) {
          // 字符串相等 + 去尾空白
          const norm = (s: string) => s.replace(/\s+$/, "").trim();
          const allMatch = expected.every((e, i) => norm(given[i] ?? "") === norm(e));
          s = allMatch ? eq.score : 0;
        }
      } else if (q.type === "PROGRAMMING") {
        // 编程题 P5.2 不评分，留 P5.3
        s = 0;
      }
    }
    if (s > 0) totalAuto += s;
    updates.push({ questionId: eqQuestionId, autoScore: s });
  }

  // 写 autoScore 到 Answer
  await prisma.$transaction(async (tx) => {
    for (const u of updates) {
      const existing = await tx.answer.findUnique({
        where: { attemptId_questionId: { attemptId: parsed.data.attemptId, questionId: u.questionId } },
      });
      if (existing) {
        await tx.answer.update({
          where: { id: existing.id },
          data: { autoScore: u.autoScore },
        });
      } else if (u.autoScore > 0) {
        // 没有作答（理论不可能，因为没作答 = 0 分）
      }
    }
    await tx.examAttempt.update({
      where: { id: parsed.data.attemptId },
      data: {
        status: "SUBMITTED" as AttemptStatus,
        submittedAt: new Date(),
        autoScore: totalAuto,
        isAutoSubmit: attempt.deadlineAt.getTime() < Date.now(),
      },
    });
  });

  revalidatePath(`/exams/${attempt.examId}`);
  revalidatePath(`/exams/${attempt.examId}/attempt/${parsed.data.attemptId}`);
  redirect(`/exams/${attempt.examId}`);
}
