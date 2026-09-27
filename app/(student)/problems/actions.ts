"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/guard";
import { addJudgeJob } from "@/lib/judge/queue";
import { runSandbox } from "@/lib/judge/sandbox";
import type { JudgeRunResult } from "@/lib/judge/local";

async function requireStudent() {
  const session = await requireSession();
  if (session.user.role !== "STUDENT") {
    throw new Error("仅学生可执行此操作");
  }
  return session;
}

/**
 * 检查学生是否有权限练习这道题：
 * - 公开题库（isPublic=true）：所有学生可见
 * - 作业里出现过的题：通过 assignment → course → courseClass.classId IN [me.classId]
 *   （防止未上课的学生跑去刷别人作业的题）
 */
async function checkPracticeAccess(problemId: string, studentId: string) {
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { id: true, isPublic: true, timeLimitMs: true, memoryLimitMb: true },
  });
  if (!problem) throw new Error("题目不存在");
  if (problem.isPublic) {
    return { problem, access: "PUBLIC" as const };
  }

  const me = await prisma.user.findUnique({
    where: { id: studentId },
    select: { classId: true },
  });
  if (!me?.classId) throw new Error("您尚未分配班级");

  // 通过 CourseClass 检查
  const accessible = await prisma.assignmentProblem.count({
    where: {
      problemId,
      assignment: {
        publishedAt: { not: null },
        course: {
          classes: { some: { classId: me.classId } },
        },
      },
    },
  });
  if (accessible === 0) {
    throw new Error("此题未公开，且未在您所在班级课程的作业中");
  }
  return { problem, access: "ASSIGNMENT_LINKED" as const };
}

const submitSchema = z.object({
  problemId: z.string().min(1),
  code: z.string().min(1, "请输入代码").max(50000, "代码过长（>50KB）"),
});

export type PracticeSubmitState = {
  error?: string;
  ok?: boolean;
  /** PENDING submission id；前端拿这个 id 去 /api/submissions/[id] 轮询 */
  submissionId?: string;
};

export async function submitForPracticeAction(
  _prev: PracticeSubmitState | undefined,
  formData: FormData,
): Promise<PracticeSubmitState> {
  const parsed = submitSchema.safeParse({
    problemId: formData.get("problemId"),
    code: formData.get("code"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "请检查输入" };
  }

  const session = await requireStudent();
  const studentId = session.user.id;

  let ctx;
  try {
    ctx = await checkPracticeAccess(parsed.data.problemId, studentId);
  } catch (e) {
    return { error: (e as Error).message };
  }

  const problemFull = await prisma.problem.findUnique({
    where: { id: parsed.data.problemId },
    select: { testCases: { select: { id: true } } },
  });
  if (!problemFull) return { error: "题目不存在" };
  if (problemFull.testCases.length === 0) {
    return { error: "该题尚未配置测试用例，无法评测" };
  }

  // 1) 创建 PENDING 提交
  const submission = await prisma.submission.create({
    data: {
      problemId: parsed.data.problemId,
      userId: studentId,
      code: parsed.data.code,
      status: "PENDING",
      totalCount: problemFull.testCases.length,
      contextType: "PRACTICE",
      contextId: null,
    },
    select: { id: true },
  });

  // 2) 入队（Worker 会拉 job 跑评测 + 写结果）
  try {
    await addJudgeJob(submission.id);
  } catch (e) {
    console.error("[submitForPracticeAction] addJudgeJob failed:", e);
    await prisma.submission.update({
      where: { id: submission.id },
      data: { status: "SYSTEM_ERROR", errorMsg: "评测队列暂时不可用" },
    });
    return { error: "评测队列暂时不可用，请稍后再试" };
  }

  revalidatePath(`/problems/${parsed.data.problemId}`);

  return { ok: true, submissionId: submission.id };
}

// ========== 运行样例（不进队列，不写 Submission）==========

const runSampleSchema = z.object({
  problemId: z.string().min(1),
  code: z.string().min(1, "请输入代码").max(50000, "代码过长（>50KB）"),
});

export type RunSampleState =
  | { ok: true; result: JudgeRunResult; error?: undefined }
  | { ok?: false; error: string; result?: undefined };

export async function runSamplePracticeAction(
  input: { problemId: string; code: string },
): Promise<RunSampleState> {
  const parsed = runSampleSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "请检查输入" };
  }

  const session = await requireSession();
  if (session.user.role !== "STUDENT") {
    return { error: "仅学生可使用此功能" };
  }
  const studentId = session.user.id;

  let ctx;
  try {
    ctx = await checkPracticeAccess(parsed.data.problemId, studentId);
  } catch (e) {
    return { error: (e as Error).message };
  }

  const problem = await prisma.problem.findUnique({
    where: { id: parsed.data.problemId },
    select: {
      timeLimitMs: true,
      memoryLimitMb: true,
      splitInputByWhitespace: true,
      testCases: {
        where: { isSample: true },
        orderBy: { order: "asc" },
        select: { input: true, expected: true, score: true },
      },
    },
  });
  if (!problem) return { error: "题目不存在" };
  if (problem.testCases.length === 0) {
    return { error: "本题没有样例用例可运行" };
  }

  const result = await runSandbox(
    parsed.data.code,
    problem.testCases.map((tc) => ({
      input: tc.input,
      expected: tc.expected,
      isSample: true,
      score: tc.score,
    })),
    {
      timeLimitMs: ctx.problem.timeLimitMs,
      memoryLimitMb: ctx.problem.memoryLimitMb,
      splitInputByWhitespace: problem.splitInputByWhitespace,
    },
  );

  return { ok: true, result };
}
