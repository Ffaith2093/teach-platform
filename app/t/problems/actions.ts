"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/guard";
import { runJudge } from "@/lib/judge/local";

// ========== 权限工具 ==========

async function requireTeacher() {
  const session = await requireSession();
  if (session.user.role !== "TEACHER") {
    throw new Error("仅教师可执行此操作");
  }
  return session;
}

async function requireProblemOwner(problemId: string) {
  const session = await requireTeacher();
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { id: true, authorId: true },
  });
  if (!problem) throw new Error("题目不存在");
  if (problem.authorId !== session.user.id) throw new Error("仅作者可编辑此题目");
  return { session, problem };
}

// ========== 创建题目 ==========

const createProblemSchema = z.object({
  title: z.string().min(1, "标题不能为空").max(100),
  description: z.string().min(1, "题干不能为空"),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
  timeLimitMs: z.coerce.number().int().min(100).max(30000).default(3000),
  memoryLimitMb: z.coerce.number().int().min(16).max(1024).default(128),
  starterCode: z.string().optional().or(z.literal("")),
  referenceSolution: z.string().optional().or(z.literal("")),
  tags: z.array(z.string()).default([]),
  isPublic: z.boolean().default(false),
});

export type CreateProblemState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof z.infer<typeof createProblemSchema>, string>>;
  ok?: true;
  problemId?: string;
};

export async function createProblemAction(
  _prev: CreateProblemState,
  formData: FormData,
): Promise<CreateProblemState> {
  const session = await requireTeacher();
  const teacherId = session.user.id;

  const tagsRaw = formData.get("tags")?.toString() ?? "[]";
  let tags: string[] = [];
  try {
    tags = JSON.parse(tagsRaw);
  } catch {
    /* ignore */
  }

  const parsed = createProblemSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    difficulty: formData.get("difficulty"),
    timeLimitMs: formData.get("timeLimitMs") || 3000,
    memoryLimitMb: formData.get("memoryLimitMb") || 128,
    starterCode: formData.get("starterCode") || undefined,
    referenceSolution: formData.get("referenceSolution") || undefined,
    tags,
    isPublic: formData.get("isPublic") === "on",
  });
  if (!parsed.success) {
    const fieldErrors: NonNullable<CreateProblemState["fieldErrors"]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.infer<typeof createProblemSchema>;
      if (key) fieldErrors[key] = issue.message;
    }
    return { error: "请检查输入", fieldErrors };
  }

  const problem = await prisma.problem.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      difficulty: parsed.data.difficulty,
      timeLimitMs: parsed.data.timeLimitMs,
      memoryLimitMb: parsed.data.memoryLimitMb,
      starterCode: parsed.data.starterCode || null,
      referenceSolution: parsed.data.referenceSolution || null,
      tags: parsed.data.tags,
      authorId: teacherId,
      isPublic: parsed.data.isPublic,
    },
  });
  revalidatePath("/t/problems");
  redirect(`/t/problems/${problem.id}`);
}

// ========== 修改题目 ==========

const updateProblemSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(1),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
  timeLimitMs: z.coerce.number().int().min(100).max(30000),
  memoryLimitMb: z.coerce.number().int().min(16).max(1024),
  starterCode: z.string().optional().or(z.literal("")),
  referenceSolution: z.string().optional().or(z.literal("")),
  tags: z.array(z.string()).default([]),
  isPublic: z.boolean().default(false),
});

export type UpdateProblemState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof z.infer<typeof updateProblemSchema>, string>>;
  ok?: true;
};

export async function updateProblemAction(
  problemId: string,
  _prev: UpdateProblemState,
  formData: FormData,
): Promise<UpdateProblemState> {
  await requireProblemOwner(problemId);

  const tagsRaw = formData.get("tags")?.toString() ?? "[]";
  let tags: string[] = [];
  try {
    tags = JSON.parse(tagsRaw);
  } catch {
    /* ignore */
  }

  const parsed = updateProblemSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    difficulty: formData.get("difficulty"),
    timeLimitMs: formData.get("timeLimitMs"),
    memoryLimitMb: formData.get("memoryLimitMb"),
    starterCode: formData.get("starterCode") || undefined,
    referenceSolution: formData.get("referenceSolution") || undefined,
    tags,
    isPublic: formData.get("isPublic") === "on",
  });
  if (!parsed.success) {
    const fieldErrors: NonNullable<UpdateProblemState["fieldErrors"]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.infer<typeof updateProblemSchema>;
      if (key) fieldErrors[key] = issue.message;
    }
    return { error: "请检查输入", fieldErrors };
  }

  await prisma.problem.update({
    where: { id: problemId },
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      difficulty: parsed.data.difficulty,
      timeLimitMs: parsed.data.timeLimitMs,
      memoryLimitMb: parsed.data.memoryLimitMb,
      starterCode: parsed.data.starterCode || null,
      referenceSolution: parsed.data.referenceSolution || null,
      tags: parsed.data.tags,
      isPublic: parsed.data.isPublic,
    },
  });
  revalidatePath(`/t/problems/${problemId}`);
  revalidatePath("/t/problems");
  return { ok: true };
}

// ========== 删除题目 ==========

export async function deleteProblemAction(problemId: string) {
  const { session } = await requireProblemOwner(problemId);
  const teacherId = session.user.id;

  // 检查：是否被作业引用（保护学生成绩）
  const refCount = await prisma.assignmentProblem.count({ where: { problemId } });
  if (refCount > 0) {
    throw new Error(
      `该题已被 ${refCount} 份作业引用，无法删除。请改用「共享到公共库」开关`,
    );
  }
  // 检查：是否被题库引用
  const qCount = await prisma.question.count({ where: { problemId } });
  if (qCount > 0) {
    throw new Error(`该题已被 ${qCount} 个题库收录，无法删除。请先在题库中移除`);
  }

  await prisma.problem.delete({ where: { id: problemId } });
  revalidatePath("/t/problems");
  redirect("/t/problems");
}

// ========== 测试用例增删 ==========

const addTestCaseSchema = z.object({
  input: z.string(),
  expected: z.string(),
  isSample: z.boolean().default(false),
  score: z.coerce.number().int().min(0).max(1000).default(10),
});

export type AddTestCaseState = { error?: string; ok?: boolean };

export async function addTestCaseAction(
  problemId: string,
  _prev: AddTestCaseState | undefined,
  formData: FormData,
): Promise<AddTestCaseState> {
  await requireProblemOwner(problemId);

  const parsed = addTestCaseSchema.safeParse({
    input: formData.get("input"),
    expected: formData.get("expected"),
    isSample: formData.get("isSample") === "on",
    score: formData.get("score") || 10,
  });
  if (!parsed.success) return { error: "请填写输入/期望输出" };

  const lastOrder = await prisma.testCase.findFirst({
    where: { problemId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const nextOrder = (lastOrder?.order ?? -1) + 1;

  await prisma.testCase.create({
    data: {
      problemId,
      input: parsed.data.input,
      expected: parsed.data.expected,
      isSample: parsed.data.isSample,
      score: parsed.data.score,
      order: nextOrder,
    },
  });
  revalidatePath(`/t/problems/${problemId}`);
  return { ok: true };
}

const updateTestCaseSchema = addTestCaseSchema;

export async function updateTestCaseAction(
  problemId: string,
  testCaseId: string,
  _prev: AddTestCaseState | undefined,
  formData: FormData,
): Promise<AddTestCaseState> {
  await requireProblemOwner(problemId);

  const parsed = updateTestCaseSchema.safeParse({
    input: formData.get("input"),
    expected: formData.get("expected"),
    isSample: formData.get("isSample") === "on",
    score: formData.get("score") || 10,
  });
  if (!parsed.success) return { error: "请填写输入/期望输出" };

  await prisma.testCase.update({
    where: { id: testCaseId },
    data: {
      input: parsed.data.input,
      expected: parsed.data.expected,
      isSample: parsed.data.isSample,
      score: parsed.data.score,
    },
  });
  revalidatePath(`/t/problems/${problemId}`);
  return { ok: true };
}

export async function removeTestCaseAction(problemId: string, testCaseId: string) {
  await requireProblemOwner(problemId);
  await prisma.testCase.delete({ where: { id: testCaseId } });
  revalidatePath(`/t/problems/${problemId}`);
}

// 批量粘贴：每行 `input|||expected|||score`，空行忽略
export async function batchAddTestCasesAction(
  problemId: string,
  _prev: AddTestCaseState | undefined,
  formData: FormData,
): Promise<AddTestCaseState> {
  await requireProblemOwner(problemId);
  const isSample = formData.get("isSample") === "on";
  const raw = formData.get("bulk")?.toString() ?? "";
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { error: "没有可解析的行" };

  const lastOrder = await prisma.testCase.findFirst({
    where: { problemId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  let nextOrder = (lastOrder?.order ?? -1) + 1;

  const data: { problemId: string; input: string; expected: string; isSample: boolean; score: number; order: number }[] = [];
  for (const line of lines) {
    const parts = line.split("|||").map((s) => s.trim());
    if (parts.length < 2) continue;
    const score = parts[2] ? Math.max(0, parseInt(parts[2], 10) || 10) : 10;
    data.push({
      problemId,
      input: parts[0],
      expected: parts[1],
      isSample,
      score,
      order: nextOrder++,
    });
  }
  if (data.length === 0) return { error: "行格式应为：输入|||期望输出|||分值（分值可选）" };

  await prisma.testCase.createMany({ data });
  revalidatePath(`/t/problems/${problemId}`);
  return { ok: true };
}

// ========== 跑测试（用参考答案） ==========

export interface RunResult {
  status: "ACCEPTED" | "WRONG_ANSWER" | "TLE" | "MLE" | "RUNTIME_ERROR" | "COMPILE_ERROR" | "SYSTEM_ERROR";
  passedCount: number;
  totalCount: number;
  maxTimeMs: number;
  cases: Array<{
    testCaseId: string | null; // null 表示临时跑（未保存）
    order: number;
    isSample: boolean;
    status: RunResult["status"];
    timeMs: number;
    actualOutput?: string;
    errorMsg?: string;
  }>;
}

export async function runProblemTestsAction(problemId: string): Promise<RunResult> {
  const { problem } = await requireProblemOwner(problemId);

  if (!problem) {
    return {
      status: "SYSTEM_ERROR",
      passedCount: 0,
      totalCount: 0,
      maxTimeMs: 0,
      cases: [],
    };
  }

  // 重读完整 problem（拿到 referenceSolution）
  const full = await prisma.problem.findUnique({
    where: { id: problemId },
    include: {
      testCases: { orderBy: { order: "asc" } },
    },
  });
  if (!full) throw new Error("题目不存在");
  if (!full.referenceSolution || !full.referenceSolution.trim()) {
    return {
      status: "SYSTEM_ERROR",
      passedCount: 0,
      totalCount: full.testCases.length,
      maxTimeMs: 0,
      cases: full.testCases.map((tc, i) => ({
        testCaseId: tc.id,
        order: i,
        isSample: tc.isSample,
        status: "SYSTEM_ERROR",
        timeMs: 0,
        errorMsg: "请先填写参考答案",
      })),
    };
  }
  if (full.testCases.length === 0) {
    return {
      status: "SYSTEM_ERROR",
      passedCount: 0,
      totalCount: 0,
      maxTimeMs: 0,
      cases: [],
    };
  }

  const result = await runJudge(
    full.referenceSolution,
    full.testCases.map((tc) => ({ input: tc.input, expected: tc.expected })),
    { timeLimitMs: full.timeLimitMs, memoryLimitMb: full.memoryLimitMb },
  );

  return {
    status: result.status,
    passedCount: result.passedCount,
    totalCount: result.totalCount,
    maxTimeMs: Math.max(...result.cases.map((c) => c.timeMs)),
    cases: result.cases.map((c, i) => ({
      testCaseId: full.testCases[i]?.id ?? null,
      order: i,
      isSample: full.testCases[i]?.isSample ?? false,
      status: c.status,
      timeMs: c.timeMs,
      actualOutput: c.actualOutput,
      errorMsg: c.errorMsg,
    })),
  };
}