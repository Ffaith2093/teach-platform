"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/guard";
import {
  singleChoiceSchema,
  fillBlankSchema,
  codeBlankSchema,
  programmingSchema,
  buildQuestionData,
  blankCountFromContent,
} from "@/app/t/questions/_helpers";

// ========== 权限工具 ==========

async function requireTeacher() {
  const session = await requireSession();
  if (session.user.role !== "TEACHER") {
    throw new Error("仅教师可执行此操作");
  }
  return session;
}

async function requireBankOwner(bankId: string) {
  const session = await requireTeacher();
  const bank = await prisma.questionBank.findUnique({
    where: { id: bankId },
    select: { id: true, ownerId: true, courseId: true },
  });
  if (!bank) throw new Error("题库不存在");
  if (bank.ownerId !== session.user.id) throw new Error("仅题库所有者可操作");
  return { session, bank };
}

// ========== 创建题库 ==========

const createBankSchema = z.object({
  name: z.string().min(1, "题库名称不能为空").max(100),
  courseId: z.string().optional().or(z.literal("")),
});

export type CreateBankState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof z.infer<typeof createBankSchema>, string>>;
  ok?: true;
  bankId?: string;
};

export async function createBankAction(
  _prev: CreateBankState,
  formData: FormData,
): Promise<CreateBankState> {
  const session = await requireTeacher();
  const teacherId = session.user.id;

  const parsed = createBankSchema.safeParse({
    name: formData.get("name"),
    courseId: formData.get("courseId") || undefined,
  });
  if (!parsed.success) {
    const fieldErrors: NonNullable<CreateBankState["fieldErrors"]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.infer<typeof createBankSchema>;
      if (key) fieldErrors[key] = issue.message;
    }
    return { error: "请检查输入", fieldErrors };
  }

  // 校验：courseId 必须是该教师任教的课程
  if (parsed.data.courseId) {
    const ct = await prisma.courseTeacher.findUnique({
      where: { courseId_teacherId: { courseId: parsed.data.courseId, teacherId } },
    });
    if (!ct) return { error: "只能关联您参与的课程" };
  }

  const bank = await prisma.questionBank.create({
    data: {
      name: parsed.data.name,
      courseId: parsed.data.courseId || null,
      ownerId: teacherId,
    },
  });
  revalidatePath("/t/banks");
  redirect(`/t/banks/${bank.id}`);
}

// ========== 修改题库 ==========

const updateBankSchema = z.object({
  name: z.string().min(1).max(100),
  courseId: z.string().optional().or(z.literal("")),
});

export type UpdateBankState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof z.infer<typeof updateBankSchema>, string>>;
  ok?: true;
};

export async function updateBankAction(
  bankId: string,
  _prev: UpdateBankState,
  formData: FormData,
): Promise<UpdateBankState> {
  const { session } = await requireBankOwner(bankId);
  const teacherId = session.user.id;

  const parsed = updateBankSchema.safeParse({
    name: formData.get("name"),
    courseId: formData.get("courseId") || undefined,
  });
  if (!parsed.success) {
    const fieldErrors: NonNullable<UpdateBankState["fieldErrors"]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.infer<typeof updateBankSchema>;
      if (key) fieldErrors[key] = issue.message;
    }
    return { error: "请检查输入", fieldErrors };
  }

  if (parsed.data.courseId) {
    const ct = await prisma.courseTeacher.findUnique({
      where: { courseId_teacherId: { courseId: parsed.data.courseId, teacherId } },
    });
    if (!ct) return { error: "只能关联您参与的课程" };
  }

  await prisma.questionBank.update({
    where: { id: bankId },
    data: {
      name: parsed.data.name,
      courseId: parsed.data.courseId || null,
    },
  });
  revalidatePath(`/t/banks/${bankId}`);
  revalidatePath("/t/banks");
  return { ok: true };
}

// ========== 删除题库 ==========

export async function deleteBankAction(bankId: string) {
  await requireBankOwner(bankId);
  await prisma.questionBank.delete({ where: { id: bankId } });
  revalidatePath("/t/banks");
  redirect("/t/banks");
}

// ========== 添加题目到题库 ==========

export async function addProblemToBankAction(
  bankId: string,
  problemId: string,
  score: number = 20,
) {
  const { session } = await requireBankOwner(bankId);
  const teacherId = session.user.id;

  // 编程题必须可用
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { authorId: true, isPublic: true },
  });
  if (!problem || (problem.authorId !== teacherId && !problem.isPublic)) {
    throw new Error("编程题不可用");
  }

  // 防止重复
  const dup = await prisma.question.findFirst({
    where: { bankId, problemId },
    select: { id: true },
  });
  if (dup) return;

  await prisma.question.create({
    data: {
      bankId,
      type: "PROGRAMMING",
      problemId,
      content: "", // 编程题以 problemId 为主，内容从 Problem 渲染
      score,
      difficulty: "MEDIUM",
      tags: [],
    },
  });
  revalidatePath(`/t/banks/${bankId}`);
}

export async function removeProblemFromBankAction(bankId: string, problemId: string) {
  await requireBankOwner(bankId);
  const q = await prisma.question.findFirst({
    where: { bankId, problemId },
    select: { id: true },
  });
  if (!q) return;
  await prisma.question.delete({ where: { id: q.id } });
  revalidatePath(`/t/banks/${bankId}`);
}

// ========== 通用：添加任意题型题目到题库 ==========

export type AddQuestionToBankState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
};

async function parseQuestionFormData(formData: FormData) {
  const rawType = formData.get("type")?.toString();

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
    return singleChoiceSchema.safeParse({
      type: "SINGLE_CHOICE",
      content: formData.get("content"),
      options,
      answer: formData.get("answer"),
      score: formData.get("score"),
      difficulty: formData.get("difficulty") || "EASY",
      explanation: formData.get("explanation") || undefined,
    });
  }

  if (rawType === "FILL_BLANK" || rawType === "CODE_BLANK") {
    const answerRaw = formData.get("answer")?.toString() ?? "[]";
    let answers: string[] = [];
    try {
      const a = JSON.parse(answerRaw);
      if (Array.isArray(a)) answers = a.map((s) => String(s).slice(0, 500));
    } catch {
      /* ignore */
    }
    const schema = rawType === "FILL_BLANK" ? fillBlankSchema : codeBlankSchema;
    return schema.safeParse({
      type: rawType,
      content: formData.get("content"),
      answer: answers,
      score: formData.get("score"),
      difficulty: formData.get("difficulty") || "EASY",
      explanation: formData.get("explanation") || undefined,
    });
  }

  if (rawType === "PROGRAMMING") {
    return programmingSchema.safeParse({
      type: "PROGRAMMING",
      problemId: formData.get("problemId"),
      score: formData.get("score"),
    });
  }

  return null;
}

export async function addQuestionToBankAction(
  bankId: string,
  _prev: AddQuestionToBankState | undefined,
  formData: FormData,
): Promise<AddQuestionToBankState> {
  const { session, bank } = await requireBankOwner(bankId);
  const teacherId = session.user.id;

  const result = await parseQuestionFormData(formData);
  if (!result) return { error: `不支持的题型` };
  if (!result.success) {
    const fieldErrors: AddQuestionToBankState["fieldErrors"] = {};
    for (const issue of result.error.issues) {
      fieldErrors[String(issue.path[0] ?? "_")] = issue.message;
    }
    return { error: "请检查输入", fieldErrors };
  }

  const input = result.data;

  // 单选题：answer 必须在 options 中
  if (input.type === "SINGLE_CHOICE") {
    if (!input.options.some((o) => o.key === input.answer)) {
      return { fieldErrors: { answer: "答案键不在选项中" } };
    }
  }

  // 填空 / 代码填空：答案数应等于题干占位数
  if (input.type === "FILL_BLANK" || input.type === "CODE_BLANK") {
    const blanks = blankCountFromContent(input.content);
    if (blanks !== input.answer.length) {
      return {
        fieldErrors: {
          answer: `题干含 ${blanks} 个空位，答案数需匹配`,
        },
      };
    }
  }

  // 编程题：检查 Problem 可用
  if (input.type === "PROGRAMMING") {
    const problem = await prisma.problem.findUnique({
      where: { id: input.problemId },
      select: { authorId: true, isPublic: true },
    });
    if (!problem || (problem.authorId !== teacherId && !problem.isPublic)) {
      return { error: "编程题不可用（需本人创建或公开）" };
    }
  }

  const { data } = await buildQuestionData(input, {
    bankId,
    courseId: bank.courseId,
  });

  await prisma.question.create({ data });

  revalidatePath(`/t/banks/${bankId}`);
  return { ok: true };
}

// ========== 通用：编辑题目 ==========

export type UpdateQuestionState = AddQuestionToBankState;

export async function updateQuestionAction(
  questionId: string,
  _prev: UpdateQuestionState | undefined,
  formData: FormData,
): Promise<UpdateQuestionState> {
  // 校验所有权（题目所属 bank 必须属于当前教师）
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    select: { id: true, bankId: true, type: true },
  });
  if (!question) return { error: "题目不存在" };
  if (!question.bankId) return { error: "试卷直属题目请在试卷中编辑" };

  const { session, bank } = await requireBankOwner(question.bankId);

  // 编程题不支持编辑（problemId 引用关系不变）；如需改请删旧建新
  if (question.type === "PROGRAMMING") {
    return { error: "编程题不支持编辑，请删除后重新添加" };
  }

  const result = await parseQuestionFormData(formData);
  if (!result) return { error: `不支持的题型` };
  if (!result.success) {
    const fieldErrors: UpdateQuestionState["fieldErrors"] = {};
    for (const issue of result.error.issues) {
      fieldErrors[String(issue.path[0] ?? "_")] = issue.message;
    }
    return { error: "请检查输入", fieldErrors };
  }

  const input = result.data;

  if (input.type !== question.type) {
    return { error: "题型不可修改" };
  }

  if (input.type === "SINGLE_CHOICE") {
    if (!input.options.some((o) => o.key === input.answer)) {
      return { fieldErrors: { answer: "答案键不在选项中" } };
    }
  }
  if (input.type === "FILL_BLANK" || input.type === "CODE_BLANK") {
    const blanks = blankCountFromContent(input.content);
    if (blanks !== input.answer.length) {
      return {
        fieldErrors: { answer: `题干含 ${blanks} 个空位，答案数需匹配` },
      };
    }
  }

  const { data } = await buildQuestionData(input, {
    bankId: question.bankId,
    courseId: bank.courseId,
  });

  await prisma.question.update({ where: { id: questionId }, data });
  void session; // suppress unused

  revalidatePath(`/t/banks/${question.bankId}`);
  return { ok: true };
}

// ========== 通用：删除题目 ==========

export async function removeQuestionFromBankAction(bankId: string, questionId: string) {
  await requireBankOwner(bankId);
  const q = await prisma.question.findUnique({
    where: { id: questionId },
    select: { id: true, bankId: true },
  });
  if (!q || q.bankId !== bankId) return;

  // 引用保护：被任何试卷引用则禁止删除
  const referenced = await prisma.examQuestion.count({
    where: { questionId },
  });
  if (referenced > 0) {
    throw new Error(`该题已被 ${referenced} 份试卷引用，无法删除`);
  }

  await prisma.question.delete({ where: { id: questionId } });
  revalidatePath(`/t/banks/${bankId}`);
}