"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { buildDrawPool, drawRulesSchema, drawTotalScore } from "@/lib/exams/rules";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/guard";
import { notifyMany } from "@/lib/notifications";
import { submitExam } from "@/lib/exams/submit";
import type { ResultMode } from "@prisma/client";

// ========== 权限工具 ==========

export async function requireCourseTeacher(courseId: string, minRole: "OWNER" | "ASSISTANT" = "ASSISTANT") {
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

export async function requireExamAccess(examId: string, minRole: "OWNER" | "ASSISTANT" = "ASSISTANT") {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { id: true, courseId: true, title: true, durationMin: true, status: true, drawRules: true },
  });
  if (!exam) throw new Error("试卷不存在");
  const ctx = await requireCourseTeacher(exam.courseId, minRole);
  return { exam, ...ctx };
}

// ========== 创建试卷 ==========

const createExamSchema = z
  .object({
    courseId: z.string().min(1, "请选择课程"),
    chapterId: z.string().optional().or(z.literal("")),
    title: z.string().min(1, "试卷标题不能为空").max(100),
    instructions: z.string().max(2000).optional().or(z.literal("")),
    durationMin: z.coerce.number().int().min(5, "时长至少 5 分钟").max(360, "时长不超过 360 分钟"),
    shuffleQuestion: z.boolean().default(true),
    shuffleOption: z.boolean().default(true),
    publish: z.boolean().default(false),
    mode: z.enum(["FIXED", "DRAW"]).default("FIXED"),
    drawRules: drawRulesSchema.optional(),
  });

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

  let rawDrawRules: unknown;
  try {
    rawDrawRules = JSON.parse(String(formData.get("drawRules") ?? "null"));
  } catch {
    return { error: "抽题规则格式错误" };
  }
  const parsed = createExamSchema.safeParse({
    courseId: formData.get("courseId"),
    chapterId: formData.get("chapterId") || undefined,
    title: formData.get("title"),
    instructions: formData.get("instructions") || undefined,
    durationMin: formData.get("durationMin") || 60,
    shuffleQuestion: formData.get("shuffleQuestion") === "on",
    shuffleOption: formData.get("shuffleOption") === "on",
    publish: formData.get("publish") === "1",
    mode: formData.get("mode") || "FIXED",
    drawRules: rawDrawRules ?? undefined,
  });
  if (!parsed.success) {
    const fieldErrors: NonNullable<CreateExamState["fieldErrors"]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.infer<typeof createExamSchema>;
      if (key) fieldErrors[key] = issue.message;
    }
    return { error: "请检查输入", fieldErrors };
  }
  if (parsed.data.mode === "FIXED" && parsed.data.publish) {
    return { error: "固定组卷请先创建草稿并添加题目，再发布" };
  }
  if (parsed.data.mode === "DRAW" && !parsed.data.drawRules) {
    return { error: "请配置抽题规则" };
  }

  // 课程权限
  const ct = await prisma.courseTeacher.findUnique({
    where: { courseId_teacherId: { courseId: parsed.data.courseId, teacherId: session.user.id } },
  });
  if (!ct || (ct.role !== "OWNER" && ct.role !== "ASSISTANT")) {
    return { error: "您无权限在该课程创建试卷" };
  }

  // openAt / closeAt 为兼容历史数据保留；V1.1 起实际准入由 ExamClassSession 控制。
  const openAt = new Date();
  const closeAt = new Date("2100-01-01T00:00:00.000Z");

  let pool: ReturnType<typeof buildDrawPool> | null = null;
  if (parsed.data.mode === "DRAW") {
    const config = parsed.data.drawRules!;
    const bank = await prisma.questionBank.findUnique({
      where: { id: config.bankId },
      select: { ownerId: true, questions: { select: { id: true, type: true, difficulty: true, tags: true } } },
    });
    if (!bank || bank.ownerId !== session.user.id) return { error: "题库不可用" };
    try {
      pool = buildDrawPool(bank.questions, config);
    } catch (error) {
      return { error: (error as Error).message };
    }
  }

  const examId = await prisma.$transaction(async (tx) => {
    const exam = await tx.exam.create({
      data: {
        courseId: parsed.data.courseId,
        chapterId: parsed.data.chapterId || null,
        title: parsed.data.title,
        instructions: parsed.data.instructions || null,
        durationMin: parsed.data.durationMin,
        openAt,
        closeAt,
        shuffleQuestion: parsed.data.shuffleQuestion,
        shuffleOption: parsed.data.shuffleOption,
        showResultMode: "AFTER_CLOSE",
        totalScore: pool ? drawTotalScore(pool) : 0,
        drawRules: pool ? (pool as Prisma.InputJsonValue) : undefined,
        status: parsed.data.publish ? "PUBLISHED" : "DRAFT",
      },
      select: { id: true },
    });
    if (pool) {
      await tx.examQuestion.createMany({
        data: pool.rules.flatMap((rule, order) => rule.questionIds.map((questionId, index) => ({
          examId: exam.id,
          questionId,
          score: rule.scorePerQuestion,
          order: order * 10000 + index,
        }))),
      });
    }
    return exam.id;
  });

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
  if (exam.drawRules) return { error: "抽题试卷的题池不可单独修改" };

  const rawType = formData.get("type")?.toString();
  const teacherId = (await requireSession()).user.id;

  let questionId: string;
  let score: number;

  if (rawType === "LIBRARY") {
    const parsed = z.object({
      questionId: z.string().min(1, "请选择题库题目"),
      score: z.coerce.number().int().min(1).max(100),
    }).safeParse({
      questionId: formData.get("questionId"),
      score: formData.get("score"),
    });
    if (!parsed.success) return { error: "请选择题库题目并填写分值" };
    const question = await prisma.question.findFirst({
      where: {
        id: parsed.data.questionId,
        bankId: { not: null },
        bank: { ownerId: teacherId },
        type: { in: ["SINGLE_CHOICE", "FILL_BLANK"] },
      },
      select: { id: true },
    });
    if (!question) return { error: "题库题目不存在或题型不可用" };
    const alreadyAdded = await prisma.examQuestion.findUnique({
      where: { examId_questionId: { examId, questionId: question.id } },
      select: { questionId: true },
    });
    if (alreadyAdded) return { error: "这道题已经在试卷中" };
    questionId = question.id;
    score = parsed.data.score;
  } else if (rawType === "SINGLE_CHOICE") {
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
  if (exam.drawRules) throw new Error("抽题试卷的题池不可单独修改");
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

// ========== 编辑试卷中的题目（沿用 buildQuestionByType 共享 helper） ==========

export async function updateQuestionInExamAction(
  examId: string,
  _prev: AddQuestionState | undefined,
  formData: FormData,
): Promise<AddQuestionState> {
  const { exam } = await requireExamAccess(examId);
  if (exam.drawRules) return { error: "抽题试卷的题池不可单独修改" };
  if (exam.status !== "DRAFT") {
    return { error: "已发布的试卷不可修改题目" };
  }

  const questionId = formData.get("questionId")?.toString();
  if (!questionId) return { error: "缺少 questionId" };

  const existing = await prisma.question.findUnique({
    where: { id: questionId },
    select: { id: true, examQuestions: { where: { examId }, select: { score: true } } },
  });
  if (!existing || existing.examQuestions.length === 0) {
    return { error: "题目不在本试卷中" };
  }

  const rawType = formData.get("type")?.toString();
  let input;

  if (rawType === "SINGLE_CHOICE") {
    const optionsRaw = formData.get("options")?.toString() ?? "[]";
    let options: { key: string; text: string }[] = [];
    try {
      const parsed = JSON.parse(optionsRaw);
      if (Array.isArray(parsed)) {
        options = parsed.map((o: { key?: string; text?: string }, i: number) => ({
          key: String(o?.key ?? String.fromCharCode(65 + i)).slice(0, 4),
          text: String(o?.text ?? "").slice(0, 200),
        }));
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
    input = parsed.data;
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
    input = parsed.data;
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
    input = parsed.data;
  } else {
    // PROGRAMMING：不允许在试卷编辑器里改 problemId（保留 wrapper 引用）
    return { error: "编程题不支持在试卷中编辑，请删除后重新添加" };
  }

  // 单选额外校验
  if (input.type === "SINGLE_CHOICE") {
    if (!input.options.some((o) => o.key === input.answer)) {
      return { fieldErrors: { answer: "答案键不在选项中" } };
    }
  }

  const oldScore = existing.examQuestions[0].score;
  const newScore = input.score;
  const scoreDelta = newScore - oldScore;

  // 按类型构造 update data
  const updateData: Record<string, unknown> = {
    content: input.content,
    score: input.score,
    difficulty: input.difficulty,
    explanation: input.explanation || null,
  };
  if (input.type === "SINGLE_CHOICE") {
    updateData.options = input.options;
    updateData.answer = input.answer;
  } else {
    updateData.options = null;
    updateData.answer = input.answer;
  }

  await prisma.$transaction([
    prisma.question.update({
      where: { id: questionId },
      data: updateData,
    }),
    prisma.examQuestion.update({
      where: { examId_questionId: { examId, questionId } },
      data: { score: newScore },
    }),
    prisma.exam.update({
      where: { id: examId },
      data: { totalScore: { increment: scoreDelta } },
    }),
  ]);

  revalidatePath(`/t/exams/${examId}`);
  return { ok: true };
}

// ========== 发布 / 撤回 ==========

export async function publishExamAction(examId: string) {
  const { exam } = await requireExamAccess(examId);
  if (exam.status === "PUBLISHED") return;

  // 必须有题目
  const count = await prisma.examQuestion.count({ where: { examId } });
  if (count === 0) throw new Error("请先挂载至少一道题再发布");
  if (exam.drawRules) {
    const parsed = drawRulesSchema.safeParse(exam.drawRules);
    if (!parsed.success || parsed.data.rules.some((rule) => !rule.questionIds || rule.questionIds.length < rule.count)) {
      throw new Error("抽题规则或题池不完整");
    }
    const ids = parsed.data.rules.flatMap((rule) => rule.questionIds ?? []);
    if (new Set(ids).size !== ids.length || ids.length !== count) throw new Error("抽题池与规则不一致");
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

// ========== 按班级开考 / 结束 ==========

async function requireExamClass(examId: string, classId: string) {
  const { exam } = await requireExamAccess(examId);
  if (exam.status !== "PUBLISHED") throw new Error("请先发布试卷");
  const courseClass = await prisma.courseClass.findUnique({
    where: { courseId_classId: { courseId: exam.courseId, classId } },
    select: { class: { select: { id: true, name: true } } },
  });
  if (!courseClass) throw new Error("该班级不属于本课程");
  return { exam, class: courseClass.class };
}

export async function openExamClassAction(examId: string, classId: string) {
  const { exam, class: targetClass } = await requireExamClass(examId, classId);
  const existing = await prisma.examClassSession.findUnique({
    where: { examId_classId: { examId, classId } },
  });
  if (existing?.status === "CLOSED") throw new Error("该班考试已经结束，不能重新开考");
  if (existing?.status === "OPEN") return { ok: true };

  const openedAt = new Date();
  await prisma.examClassSession.upsert({
    where: { examId_classId: { examId, classId } },
    create: { examId, classId, status: "OPEN", openedAt },
    update: { status: "OPEN", openedAt, closedAt: null },
  });

  const students = await prisma.user.findMany({
    where: { classId, role: "STUDENT", status: "ACTIVE" },
    select: { id: true },
  });
  try {
    await notifyMany({
      userIds: students.map((student) => student.id),
      title: `考试已开始：《${exam.title}》`,
      body: `${targetClass.name}已开放答题 · 时长 ${exam.durationMin} 分钟`,
      href: `/exams/${examId}`,
      courseId: exam.courseId,
      classId,
    });
  } catch {
    // 通知失败不影响开考。
  }

  revalidatePath(`/t/exams/${examId}`);
  revalidatePath(`/t/exams/${examId}/monitor`);
  revalidatePath("/exams");
  revalidatePath(`/exams/${examId}`);
  return { ok: true };
}

export async function closeExamClassAction(examId: string, classId: string) {
  await requireExamClass(examId, classId);
  const current = await prisma.examClassSession.findUnique({
    where: { examId_classId: { examId, classId } },
    select: { status: true },
  });
  if (!current || current.status === "PENDING") throw new Error("该班考试尚未开始");
  const claimed = await prisma.examClassSession.updateMany({
    where: { examId, classId, status: "OPEN" },
    data: { status: "CLOSED", closedAt: new Date() },
  });

  const attempts = await prisma.examAttempt.findMany({
    where: {
      examId,
      status: "IN_PROGRESS",
      student: { classId },
    },
    select: { id: true },
  });
  const settled = await Promise.allSettled(attempts.map((attempt) => submitExam(attempt.id)));
  const failed = settled.filter(
    (result) => result.status === "rejected" || (result.status === "fulfilled" && !result.value.ok),
  ).length;

  revalidatePath(`/t/exams/${examId}`);
  revalidatePath(`/t/exams/${examId}/monitor`);
  revalidatePath(`/t/exams/${examId}/grade`);
  revalidatePath("/exams");
  revalidatePath(`/exams/${examId}`);
  return { ok: true, submitted: attempts.length - failed, failed, alreadyClosed: !claimed.count };
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
