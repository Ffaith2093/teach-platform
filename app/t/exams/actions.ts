"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/guard";
import type { ResultMode } from "@prisma/client";

// ========== 权限工具 ==========

async function requireCourseTeacher(courseId: string, minRole: "OWNER" | "ASSISTANT" = "ASSISTANT") {
  const session = await requireSession();
  if (session.user.role !== "TEACHER") {
    throw new Error("仅教师可执行此操作");
  }
  const ct = await prisma.courseTeacher.findUnique({
    where: { courseId_teacherId: { courseId, teacherId: session.user.id } },
  });
  if (!ct) throw new Error("您不在该课程的教师团队中");
  if (minRole === "OWNER" && ct.role !== "OWNER") {
    throw new Error("仅主讲教师可执行此操作");
  }
  if (minRole === "ASSISTANT" && ct.role !== "OWNER" && ct.role !== "ASSISTANT") {
    throw new Error("权限不足");
  }
  return { session, role: ct.role };
}

async function requireExamAccess(examId: string, minRole: "OWNER" | "ASSISTANT" = "ASSISTANT") {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { id: true, courseId: true, status: true },
  });
  if (!exam) throw new Error("试卷不存在");
  const ctx = await requireCourseTeacher(exam.courseId, minRole);
  return { exam, ...ctx };
}

// ========== 创建试卷 ==========

const createExamSchema = z
  .object({
    courseId: z.string().min(1, "请选择课程"),
    title: z.string().min(1, "试卷标题不能为空").max(100),
    instructions: z.string().max(2000).optional().or(z.literal("")),
    durationMin: z.coerce.number().int().min(5, "时长至少 5 分钟").max(360, "时长不超过 360 分钟"),
    openAt: z.string().min(1, "请选择开考时间"),
    closeAt: z.string().min(1, "请选择结束时间"),
    shuffleQuestion: z.boolean().default(true),
    shuffleOption: z.boolean().default(true),
    showResultMode: z.enum(["IMMEDIATELY", "AFTER_CLOSE", "AFTER_GRADED", "NEVER"]).default("AFTER_CLOSE"),
    publish: z.boolean().default(false),
  })
  .refine(
    (d) => new Date(d.openAt).getTime() < new Date(d.closeAt).getTime(),
    "结束时间必须晚于开考时间",
  );

export type CreateExamState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof z.infer<typeof createExamSchema>, string>>;
  ok?: true;
  examId?: string;
};

export async function createExamAction(
  _prev: CreateExamState | undefined,
  formData: FormData,
): Promise<CreateExamState> {
  const session = await requireSession();
  if (session.user.role !== "TEACHER") {
    return { error: "仅教师可创建试卷" };
  }

  const parsed = createExamSchema.safeParse({
    courseId: formData.get("courseId"),
    title: formData.get("title"),
    instructions: formData.get("instructions") || undefined,
    durationMin: formData.get("durationMin") || 60,
    openAt: formData.get("openAt"),
    closeAt: formData.get("closeAt"),
    shuffleQuestion: formData.get("shuffleQuestion") === "on",
    shuffleOption: formData.get("shuffleOption") === "on",
    showResultMode: formData.get("showResultMode") || "AFTER_CLOSE",
    publish: formData.get("publish") === "1",
  });
  if (!parsed.success) {
    const fieldErrors: NonNullable<CreateExamState["fieldErrors"]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.infer<typeof createExamSchema>;
      if (key) fieldErrors[key] = issue.message;
    }
    return { error: "请检查输入", fieldErrors };
  }

  // 课程权限
  const ct = await prisma.courseTeacher.findUnique({
    where: { courseId_teacherId: { courseId: parsed.data.courseId, teacherId: session.user.id } },
  });
  if (!ct || (ct.role !== "OWNER" && ct.role !== "ASSISTANT")) {
    return { error: "您无权限在该课程创建试卷" };
  }

  // 时间校验
  const openAt = new Date(parsed.data.openAt);
  const closeAt = new Date(parsed.data.closeAt);
  if (parsed.data.publish && openAt.getTime() < Date.now()) {
    return { fieldErrors: { openAt: "开考时间必须晚于当前时间" } };
  }

  let examId: string;
  try {
    examId = await prisma.exam.create({
      data: {
        courseId: parsed.data.courseId,
        title: parsed.data.title,
        instructions: parsed.data.instructions || null,
        durationMin: parsed.data.durationMin,
        openAt,
        closeAt,
        shuffleQuestion: parsed.data.shuffleQuestion,
        shuffleOption: parsed.data.shuffleOption,
        showResultMode: parsed.data.showResultMode as ResultMode,
        totalScore: 0,
        status: parsed.data.publish ? "PUBLISHED" : "DRAFT",
      },
      select: { id: true },
    }).then((e) => e.id);
  } catch (e) {
    throw e;
  }

  revalidatePath("/t/exams");
  if (!parsed.data.publish) {
    redirect(`/t/exams/${examId}`);
  }
  redirect(`/t/exams/${examId}`);
}

// ========== 修改试卷基本信息（DRAFT 专属） ==========

const updateExamSchema = z
  .object({
    title: z.string().min(1).max(100),
    instructions: z.string().max(2000).optional().or(z.literal("")),
    durationMin: z.coerce.number().int().min(5).max(360),
    openAt: z.string().min(1),
    closeAt: z.string().min(1),
    shuffleQuestion: z.boolean().default(true),
    shuffleOption: z.boolean().default(true),
    showResultMode: z.enum(["IMMEDIATELY", "AFTER_CLOSE", "AFTER_GRADED", "NEVER"]),
  })
  .refine(
    (d) => new Date(d.openAt).getTime() < new Date(d.closeAt).getTime(),
    "结束时间必须晚于开考时间",
  );

export type UpdateExamState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof z.infer<typeof updateExamSchema>, string>>;
  ok?: boolean;
};

export async function updateExamAction(
  examId: string,
  _prev: UpdateExamState | undefined,
  formData: FormData,
): Promise<UpdateExamState> {
  const { exam } = await requireExamAccess(examId);
  if (exam.status !== "DRAFT") {
    return { error: "已发布的试卷不可修改基本信息" };
  }
  const parsed = updateExamSchema.safeParse({
    title: formData.get("title"),
    instructions: formData.get("instructions") || undefined,
    durationMin: formData.get("durationMin") || 60,
    openAt: formData.get("openAt"),
    closeAt: formData.get("closeAt"),
    shuffleQuestion: formData.get("shuffleQuestion") === "on",
    shuffleOption: formData.get("shuffleOption") === "on",
    showResultMode: formData.get("showResultMode") || "AFTER_CLOSE",
  });
  if (!parsed.success) {
    const fieldErrors: NonNullable<UpdateExamState["fieldErrors"]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.infer<typeof updateExamSchema>;
      if (key) fieldErrors[key] = issue.message;
    }
    return { error: "请检查输入", fieldErrors };
  }

  await prisma.exam.update({
    where: { id: examId },
    data: {
      title: parsed.data.title,
      instructions: parsed.data.instructions || null,
      durationMin: parsed.data.durationMin,
      openAt: new Date(parsed.data.openAt),
      closeAt: new Date(parsed.data.closeAt),
      shuffleQuestion: parsed.data.shuffleQuestion,
      shuffleOption: parsed.data.shuffleOption,
      showResultMode: parsed.data.showResultMode as ResultMode,
    },
  });
  revalidatePath(`/t/exams/${examId}`);
  return { ok: true };
}

// ========== 添加题目（按 type 分发） ==========

const addChoiceSchema = z.object({
  type: z.literal("SINGLE_CHOICE"),
  content: z.string().min(1, "题干不能为空").max(2000),
  options: z
    .array(z.object({ key: z.string(), text: z.string().min(1) }))
    .min(2, "至少 2 个选项")
    .max(8),
  answer: z.string().min(1, "请填写正确答案"),
  score: z.coerce.number().int().min(1).max(100),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("EASY"),
  explanation: z.string().max(2000).optional().or(z.literal("")),
});

const addFillBlankSchema = z.object({
  type: z.literal("FILL_BLANK"),
  content: z.string().min(1, "题干不能为空").max(2000),
  answer: z.array(z.string().min(1)).min(1, "至少 1 个答案"),
  score: z.coerce.number().int().min(1).max(100),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("EASY"),
  explanation: z.string().max(2000).optional().or(z.literal("")),
});

const addCodeBlankSchema = z.object({
  type: z.literal("CODE_BLANK"),
  content: z.string().min(1, "题干不能为空（含 {{1}} {{2}} 占位）").max(5000),
  answer: z.array(z.string().min(1)).min(1, "至少 1 个空位"),
  score: z.coerce.number().int().min(1).max(100),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("EASY"),
  explanation: z.string().max(2000).optional().or(z.literal("")),
});

const addProgrammingSchema = z.object({
  type: z.literal("PROGRAMMING"),
  problemId: z.string().min(1, "请选择编程题"),
  score: z.coerce.number().int().min(1).max(100),
});

export type AddQuestionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
};

export async function addQuestionToExamAction(
  examId: string,
  _prev: AddQuestionState | undefined,
  formData: FormData,
): Promise<AddQuestionState> {
  const { exam } = await requireExamAccess(examId);
  if (exam.status !== "DRAFT") {
    return { error: "已发布的试卷不可修改题目" };
  }

  const rawType = formData.get("type")?.toString();
  const teacherId = (await requireSession()).user.id;

  let questionId: string;
  let score: number;

  if (rawType === "SINGLE_CHOICE") {
    const optionsRaw = formData.get("options")?.toString() ?? "[]";
    let options: { key: string; text: string }[] = [];
    try {
      const parsedOpts = JSON.parse(optionsRaw);
      if (Array.isArray(parsedOpts)) {
        options = parsedOpts
          .map((o, i) => ({
            key: String(o?.key ?? String.fromCharCode(65 + i)).slice(0, 4),
            text: String(o?.text ?? "").slice(0, 200),
          }))
          .filter((o) => o.text.trim());
      }
    } catch {
      /* ignore */
    }

    const parsed = addChoiceSchema.safeParse({
      type: "SINGLE_CHOICE",
      content: formData.get("content"),
      options,
      answer: formData.get("answer"),
      score: formData.get("score"),
      difficulty: formData.get("difficulty") || "EASY",
      explanation: formData.get("explanation") || undefined,
    });
    if (!parsed.success) {
      const fieldErrors: AddQuestionState["fieldErrors"] = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[String(issue.path[0] ?? "_")] = issue.message;
      }
      return { error: "请检查输入", fieldErrors };
    }
    // 校验 answer ∈ options
    if (!parsed.data.options.some((o) => o.key === parsed.data.answer)) {
      return { fieldErrors: { answer: "答案键不在选项中" } };
    }

    const q = await prisma.question.create({
      data: {
        type: "SINGLE_CHOICE",
        content: parsed.data.content,
        options: parsed.data.options,
        answer: parsed.data.answer,
        score: parsed.data.score,
        difficulty: parsed.data.difficulty,
        explanation: parsed.data.explanation || null,
        courseId: exam.courseId,
      },
      select: { id: true },
    });
    questionId = q.id;
    score = parsed.data.score;
  } else if (rawType === "FILL_BLANK") {
    const answerRaw = formData.get("answer")?.toString() ?? "[]";
    let answers: string[] = [];
    try {
      const a = JSON.parse(answerRaw);
      if (Array.isArray(a)) answers = a.map((s) => String(s).slice(0, 200));
    } catch {
      /* ignore */
    }

    const parsed = addFillBlankSchema.safeParse({
      type: "FILL_BLANK",
      content: formData.get("content"),
      answer: answers,
      score: formData.get("score"),
      difficulty: formData.get("difficulty") || "EASY",
      explanation: formData.get("explanation") || undefined,
    });
    if (!parsed.success) {
      const fieldErrors: AddQuestionState["fieldErrors"] = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[String(issue.path[0] ?? "_")] = issue.message;
      }
      return { error: "请检查输入", fieldErrors };
    }

    const q = await prisma.question.create({
      data: {
        type: "FILL_BLANK",
        content: parsed.data.content,
        answer: parsed.data.answer,
        score: parsed.data.score,
        difficulty: parsed.data.difficulty,
        explanation: parsed.data.explanation || null,
        courseId: exam.courseId,
      },
      select: { id: true },
    });
    questionId = q.id;
    score = parsed.data.score;
  } else if (rawType === "CODE_BLANK") {
    const answerRaw = formData.get("answer")?.toString() ?? "[]";
    let answers: string[] = [];
    try {
      const a = JSON.parse(answerRaw);
      if (Array.isArray(a)) answers = a.map((s) => String(s).slice(0, 500));
    } catch {
      /* ignore */
    }

    const parsed = addCodeBlankSchema.safeParse({
      type: "CODE_BLANK",
      content: formData.get("content"),
      answer: answers,
      score: formData.get("score"),
      difficulty: formData.get("difficulty") || "EASY",
      explanation: formData.get("explanation") || undefined,
    });
    if (!parsed.success) {
      const fieldErrors: AddQuestionState["fieldErrors"] = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[String(issue.path[0] ?? "_")] = issue.message;
      }
      return { error: "请检查输入", fieldErrors };
    }

    const q = await prisma.question.create({
      data: {
        type: "CODE_BLANK",
        content: parsed.data.content,
        answer: parsed.data.answer,
        score: parsed.data.score,
        difficulty: parsed.data.difficulty,
        explanation: parsed.data.explanation || null,
        courseId: exam.courseId,
      },
      select: { id: true },
    });
    questionId = q.id;
    score = parsed.data.score;
  } else if (rawType === "PROGRAMMING") {
    const parsed = addProgrammingSchema.safeParse({
      type: "PROGRAMMING",
      problemId: formData.get("problemId"),
      score: formData.get("score"),
    });
    if (!parsed.success) {
      return { error: "请选择编程题并填写分值" };
    }

    // 编程题必须可用（作者本人 or 公开）
    const problem = await prisma.problem.findUnique({
      where: { id: parsed.data.problemId },
      select: { id: true, authorId: true, isPublic: true },
    });
    if (!problem || (problem.authorId !== teacherId && !problem.isPublic)) {
      return { error: "编程题不可用（需本人创建或公开）" };
    }

    // 创建一个 wrapper Question 引用 Program
    const q = await prisma.question.create({
      data: {
        type: "PROGRAMMING",
        content: "（编程题）", // 占位（实际渲染时拉 problem.description）
        problemId: parsed.data.problemId,
        score: parsed.data.score,
        difficulty: "EASY",
        courseId: exam.courseId,
      },
      select: { id: true },
    });
    questionId = q.id;
    score = parsed.data.score;
  } else {
    return { error: `不支持的题型：${rawType}` };
  }

  // 挂到 ExamQuestion
  const lastOrder = await prisma.examQuestion.findFirst({
    where: { examId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const nextOrder = (lastOrder?.order ?? -1) + 1;

  await prisma.$transaction([
    prisma.examQuestion.create({
      data: { examId, questionId, score, order: nextOrder },
    }),
    prisma.exam.update({
      where: { id: examId },
      data: { totalScore: { increment: score } },
    }),
  ]);

  revalidatePath(`/t/exams/${examId}`);
  return { ok: true };
}

export async function removeQuestionFromExamAction(examId: string, questionId: string) {
  const { exam } = await requireExamAccess(examId);
  if (exam.status !== "DRAFT") {
    throw new Error("已发布的试卷不可修改题目");
  }
  const eq = await prisma.examQuestion.findUnique({
    where: { examId_questionId: { examId, questionId } },
  });
  if (!eq) return;

  await prisma.$transaction([
    prisma.examQuestion.delete({
      where: { examId_questionId: { examId, questionId } },
    }),
    prisma.exam.update({
      where: { id: examId },
      data: { totalScore: { decrement: eq.score } },
    }),
  ]);
  revalidatePath(`/t/exams/${examId}`);
}

// ========== 发布 / 撤回 ==========

export async function publishExamAction(examId: string) {
  const { exam } = await requireExamAccess(examId);
  if (exam.status === "PUBLISHED") return;

  // 必须有题目
  const count = await prisma.examQuestion.count({ where: { examId } });
  if (count === 0) throw new Error("请先挂载至少一道题再发布");

  // 时间校验
  const full = await prisma.exam.findUnique({
    where: { id: examId },
    select: { openAt: true },
  });
  if (!full || full.openAt.getTime() < Date.now()) {
    throw new Error("开考时间必须晚于当前时间");
  }

  await prisma.exam.update({
    where: { id: examId },
    data: { status: "PUBLISHED" },
  });
  revalidatePath(`/t/exams/${examId}`);
  revalidatePath("/t/exams");
}

export async function unpublishExamAction(examId: string) {
  const { exam } = await requireExamAccess(examId, "OWNER");
  if (exam.status !== "PUBLISHED") return;

  // 已关闭或已有学生 attempt 不可撤回
  const attemptCount = await prisma.examAttempt.count({ where: { examId } });
  if (attemptCount > 0) throw new Error("已有学生参加考试，无法撤回发布");

  await prisma.exam.update({
    where: { id: examId },
    data: { status: "DRAFT" },
  });
  revalidatePath(`/t/exams/${examId}`);
  revalidatePath("/t/exams");
}

export async function closeExamAction(examId: string) {
  const { exam } = await requireExamAccess(examId);
  if (exam.status === "CLOSED") return;
  await prisma.exam.update({
    where: { id: examId },
    data: { status: "CLOSED" },
  });
  revalidatePath(`/t/exams/${examId}`);
  revalidatePath("/t/exams");
}

// ========== 删除（OWNER 专属） ==========

export async function deleteExamAction(examId: string) {
  const { exam } = await requireExamAccess(examId, "OWNER");
  // 有学生 attempt 则禁止
  if (exam.status === "PUBLISHED" || exam.status === "CLOSED") {
    const cnt = await prisma.examAttempt.count({ where: { examId } });
    if (cnt > 0) throw new Error("已有学生尝试，无法删除。请联系管理员归档。");
  }
  await prisma.exam.delete({ where: { id: examId } });
  revalidatePath("/t/exams");
  redirect("/t/exams");
}
