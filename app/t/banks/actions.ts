"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/guard";

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
    select: { id: true, ownerId: true },
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