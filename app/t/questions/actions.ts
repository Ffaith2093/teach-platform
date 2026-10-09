"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  singleChoiceSchema,
  fillBlankSchema,
  codeBlankSchema,
  programmingSchema,
  buildQuestionData,
  blankCountFromContent,
} from "@/app/t/questions/_helpers";
import { requireBankOwner } from "@/app/t/banks/actions";
import { requireSession } from "@/lib/auth/guard";

// ========== 添加题目到题库 ==========

export type AddQuestionToBankState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
};

/** 解析题目表单 → 各题型 zod schema */
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

async function createQuestionInBank(
  bankId: string,
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

  return { ok: true };
}

export async function addQuestionToBankAction(
  bankId: string,
  _prev: AddQuestionToBankState | undefined,
  formData: FormData,
): Promise<AddQuestionToBankState> {
  const result = await createQuestionInBank(bankId, formData);
  if (result.ok) revalidatePath(`/t/banks/${bankId}`);
  return result;
}

export async function addLibraryQuestionAction(
  expectedType: "SINGLE_CHOICE" | "FILL_BLANK",
  _prev: AddQuestionToBankState | undefined,
  formData: FormData,
): Promise<AddQuestionToBankState> {
  let bankId = formData.get("bankId")?.toString() ?? "";
  if (!bankId) {
    const session = await requireSession();
    if (session.user.role !== "TEACHER" && session.user.role !== "ADMIN") {
      return { error: "仅教师可创建题目" };
    }
    const bank = await prisma.questionBank.upsert({
      where: {
        id: (await prisma.questionBank.findFirst({
          where: { ownerId: session.user.id, name: "默认题库", courseId: null },
          select: { id: true },
        }))?.id ?? "__create_default_bank__",
      },
      update: {},
      create: { name: "默认题库", ownerId: session.user.id },
      select: { id: true },
    });
    bankId = bank.id;
  }
  if (formData.get("type") !== expectedType) return { error: "题型与当前页面不一致" };

  const result = await createQuestionInBank(bankId, formData);
  if (result.ok) {
    revalidatePath(`/t/banks/${bankId}`);
    revalidatePath(expectedType === "SINGLE_CHOICE" ? "/t/banks/choice" : "/t/banks/fill");
  }
  return result;
}

// ========== 编辑题目 ==========

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

  const { bank } = await requireBankOwner(question.bankId);

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

  revalidatePath(`/t/banks/${question.bankId}`);
  return { ok: true };
}

// ========== 删除题目 ==========

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

  await prisma.question.delete({ where: { id: q.id } });
  revalidatePath(`/t/banks/${bankId}`);
}

// ========== 把编程题加入题库（作为 PROGRAMMING 类型 Question）==========

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
