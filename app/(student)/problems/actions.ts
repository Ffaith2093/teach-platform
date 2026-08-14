"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/guard";
import { runJudge } from "@/lib/judge/local";

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
  judge?: {
    submissionId: string;
    status: string;
    passedCount: number;
    totalCount: number;
    autoScore: number; // 本次得分（满分 = 全部分值）
    timeMs: number;
    cases: Array<{
      order: number;
      isSample: boolean;
      status: string;
      timeMs: number;
      actualOutput?: string;
      errorMsg?: string;
    }>;
  };
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
    include: {
      testCases: {
        orderBy: { order: "asc" },
        select: { id: true, input: true, expected: true, isSample: true, score: true },
      },
    },
  });
  if (!problemFull) return { error: "题目不存在" };

  if (problemFull.testCases.length === 0) {
    return { error: "该题尚未配置测试用例，无法评测" };
  }

  // 跑评测
  const judgeResult = await runJudge(
    parsed.data.code,
    problemFull.testCases.map((tc) => ({
      input: tc.input,
      expected: tc.expected,
      isSample: tc.isSample,
      score: tc.score,
    })),
    { timeLimitMs: problemFull.timeLimitMs, memoryLimitMb: problemFull.memoryLimitMb },
  );

  const totalScore = problemFull.testCases.reduce((s, tc) => s + tc.score, 0);

  // 持久化
  const submissionId = await prisma.$transaction(async (tx) => {
    const sub = await tx.submission.create({
      data: {
        problemId: parsed.data.problemId,
        userId: studentId,
        code: parsed.data.code,
        status: judgeResult.status as
          | "PENDING"
          | "JUDGING"
          | "ACCEPTED"
          | "WRONG_ANSWER"
          | "TLE"
          | "MLE"
          | "RUNTIME_ERROR"
          | "COMPILE_ERROR"
          | "SYSTEM_ERROR",
        score: judgeResult.totalScore,
        passedCount: judgeResult.passedCount,
        totalCount: judgeResult.totalCount,
        maxTimeMs: Math.max(0, ...judgeResult.cases.map((c) => c.timeMs)),
        errorMsg: judgeResult.cases.find((c) => c.errorMsg)?.errorMsg?.slice(0, 2000) ?? null,
        contextType: "PRACTICE",
        contextId: null,
      },
    });

    if (judgeResult.cases.length > 0) {
      await tx.judgeCase.createMany({
        data: problemFull.testCases.map((tc, i) => {
          const c = judgeResult.cases[i];
          return {
            submissionId: sub.id,
            testCaseId: tc.id,
            status: (c?.status ?? "SYSTEM_ERROR") as
              | "PENDING"
              | "JUDGING"
              | "ACCEPTED"
              | "WRONG_ANSWER"
              | "TLE"
              | "MLE"
              | "RUNTIME_ERROR"
              | "COMPILE_ERROR"
              | "SYSTEM_ERROR",
            timeMs: c?.timeMs ?? 0,
            actualOutput: tc.isSample ? c?.actualOutput ?? null : null,
          };
        }),
      });
    }

    return sub.id;
  });

  revalidatePath(`/problems/${parsed.data.problemId}`);
  revalidatePath("/problems");

  return {
    ok: true,
    judge: {
      submissionId,
      status: judgeResult.status,
      passedCount: judgeResult.passedCount,
      totalCount: judgeResult.totalCount,
      autoScore: judgeResult.totalScore,
      timeMs: Math.max(0, ...judgeResult.cases.map((c) => c.timeMs)),
      cases: judgeResult.cases.map((c, i) => {
        const tc = problemFull.testCases[i];
        const isSample = tc?.isSample ?? false;
        return {
          order: i,
          isSample,
          status: c.status,
          timeMs: c.timeMs,
          actualOutput: isSample ? c.actualOutput : undefined,
          errorMsg: c.errorMsg,
        };
      }),
    },
  };
}
