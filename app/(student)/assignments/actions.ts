"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/guard";
import { runJudge } from "@/lib/judge/local";

// ========== 权限工具 ==========

async function requireStudent() {
  const session = await requireSession();
  if (session.user.role !== "STUDENT") {
    throw new Error("仅学生可执行此操作");
  }
  return session;
}

/**
 * 校验 student 是否在 assignment.course 关联的某个班级里。
 * 返回值含 user / assignment / assignmentProblem / classId
 */
async function requireAssignmentForStudent(assignmentId: string, problemId: string) {
  const session = await requireStudent();
  const studentId = session.user.id;

  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: { classId: true },
  });
  if (!student?.classId) throw new Error("您尚未分配班级，无法作答");

  const assignmentProblem = await prisma.assignmentProblem.findUnique({
    where: { assignmentId_problemId: { assignmentId, problemId } },
    include: {
      assignment: {
        select: {
          id: true,
          title: true,
          dueAt: true,
          allowLate: true,
          latePenalty: true,
          totalScore: true,
          publishedAt: true,
          courseId: true,
        },
      },
    },
  });
  if (!assignmentProblem) throw new Error("题目不在此作业中");
  if (!assignmentProblem.assignment.publishedAt) {
    throw new Error("作业尚未发布，暂不能作答");
  }

  // 校验学生所在班级在作业所在课程的班级列表里
  const accessible = await prisma.courseClass.findFirst({
    where: {
      courseId: assignmentProblem.assignment.courseId,
      classId: student.classId,
    },
  });
  if (!accessible) throw new Error("您不在此作业关联的班级中");

  return {
    studentId,
    studentClassId: student.classId,
    assignmentProblem,
    assignment: assignmentProblem.assignment,
  };
}

function judgeStatusToSubmissionStatus(s: string) {
  return s as
    | "PENDING"
    | "JUDGING"
    | "ACCEPTED"
    | "WRONG_ANSWER"
    | "TLE"
    | "MLE"
    | "RUNTIME_ERROR"
    | "COMPILE_ERROR"
    | "SYSTEM_ERROR";
}

// ========== 学生提交代码 ==========

const submitSchema = z.object({
  assignmentId: z.string().min(1),
  problemId: z.string().min(1),
  code: z.string().min(1, "请输入代码").max(50000, "代码过长（>50KB）"),
});

export type SubmitProblemState = {
  error?: string;
  ok?: boolean;
  // 评测结果（仅出错时不返回）
  judge?: {
    submissionId: string;
    status: string;
    passedCount: number;
    totalCount: number;
    autoScore: number; // 本题得分（满分 = 题目权重）
    timeMs: number;
    cases: Array<{
      order: number;
      isSample: boolean;
      status: string;
      timeMs: number;
      actualOutput?: string; // 仅 sample 返回
      errorMsg?: string;
    }>;
  };
};

export async function submitProblemAction(
  _prev: SubmitProblemState | undefined,
  formData: FormData,
): Promise<SubmitProblemState> {
  const parsed = submitSchema.safeParse({
    assignmentId: formData.get("assignmentId"),
    problemId: formData.get("problemId"),
    code: formData.get("code"),
  });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "请检查输入";
    return { error: msg };
  }

  let ctx;
  try {
    ctx = await requireAssignmentForStudent(parsed.data.assignmentId, parsed.data.problemId);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const { studentId, assignmentProblem: ap, assignment } = ctx;

  // 截止时间 / 迟交策略
  const now = new Date();
  if (assignment.dueAt < now && !assignment.allowLate) {
    return { error: "作业已截止且不允许迟交" };
  }

  // 取题目 + 测试用例
  const problem = await prisma.problem.findUnique({
    where: { id: parsed.data.problemId },
    include: {
      testCases: { orderBy: { order: "asc" } },
    },
  });
  if (!problem) return { error: "题目不存在" };

  // 跑评测
  const judgeResult = await runJudge(
    parsed.data.code,
    problem.testCases.map((tc) => ({
      input: tc.input,
      expected: tc.expected,
      isSample: tc.isSample,
      score: tc.score,
    })),
    { timeLimitMs: problem.timeLimitMs, memoryLimitMb: problem.memoryLimitMb },
  );

  // 本题在作业中的得分上限 = ap.score（题目分值），按比例算
  const maxScoreForThisProblem = ap.score;
  const scoreRatio = judgeResult.totalScore > 0 ? judgeResult.totalScore / ap.score : 0;
  const autoScoreForThisProblem = Math.round(scoreRatio * maxScoreForThisProblem);

  // 持久化：用单 transaction 保一致性
  const submissionId = await prisma.$transaction(async (tx) => {
    // 1) 创建 Submission
    const sub = await tx.submission.create({
      data: {
        problemId: parsed.data.problemId,
        userId: studentId,
        code: parsed.data.code,
        status: judgeStatusToSubmissionStatus(judgeResult.status),
        score: autoScoreForThisProblem,
        passedCount: judgeResult.passedCount,
        totalCount: judgeResult.totalCount,
        maxTimeMs: Math.max(0, ...judgeResult.cases.map((c) => c.timeMs)),
        errorMsg: judgeResult.cases.find((c) => c.errorMsg)?.errorMsg?.slice(0, 2000) ?? null,
        contextType: "ASSIGNMENT",
        contextId: parsed.data.assignmentId,
      },
    });

    // 2) 创建 JudgeCase 记录（仅 sample 返回 actualOutput 给学生）
    if (problem.testCases.length > 0 && judgeResult.cases.length > 0) {
      const judgeCaseData = problem.testCases.map((tc, i) => {
        const c = judgeResult.cases[i];
        return {
          submissionId: sub.id,
          testCaseId: tc.id,
          status: judgeStatusToSubmissionStatus(c?.status ?? "SYSTEM_ERROR"),
          timeMs: c?.timeMs ?? 0,
          actualOutput: tc.isSample ? c?.actualOutput ?? null : null,
        };
      });
      await tx.judgeCase.createMany({ data: judgeCaseData });
    }

    // 3) 重新计算 AssignmentSubmission.autoScore = sum(latest score per problem)
    const allProblems = await tx.assignmentProblem.findMany({
      where: { assignmentId: parsed.data.assignmentId },
      select: { problemId: true, score: true },
    });
    let totalAutoScore = 0;
    for (const p of allProblems) {
      const latest = await tx.submission.findFirst({
        where: {
          problemId: p.problemId,
          userId: studentId,
          contextType: "ASSIGNMENT",
          contextId: parsed.data.assignmentId,
        },
        orderBy: { createdAt: "desc" },
        select: { score: true },
      });
      totalAutoScore += latest?.score ?? 0;
    }

    // 4) upsert AssignmentSubmission
    const existing = await tx.assignmentSubmission.findUnique({
      where: { assignmentId_studentId: { assignmentId: parsed.data.assignmentId, studentId } },
    });
    if (existing) {
      await tx.assignmentSubmission.update({
        where: { id: existing.id },
        data: {
          autoScore: totalAutoScore,
          // 有提交则进 SUBMITTED，覆盖原 DRAFT
          status: "SUBMITTED",
          submittedAt: existing.submittedAt ?? now,
        },
      });
    } else {
      await tx.assignmentSubmission.create({
        data: {
          assignmentId: parsed.data.assignmentId,
          studentId,
          autoScore: totalAutoScore,
          status: "SUBMITTED",
          submittedAt: now,
        },
      });
    }

    return sub.id;
  });

  revalidatePath(`/assignments/${parsed.data.assignmentId}`);
  revalidatePath(`/t/assignments/${parsed.data.assignmentId}`);

  return {
    ok: true,
    judge: {
      submissionId,
      status: judgeResult.status,
      passedCount: judgeResult.passedCount,
      totalCount: judgeResult.totalCount,
      autoScore: autoScoreForThisProblem,
      timeMs: Math.max(0, ...judgeResult.cases.map((c) => c.timeMs)),
      cases: judgeResult.cases.map((c, i) => {
        const tc = problem.testCases[i];
        const isSample = tc?.isSample ?? false;
        return {
          order: i,
          isSample,
          status: c.status,
          timeMs: c.timeMs,
          // 仅样例的实际输出返回给学生
          actualOutput: isSample ? c.actualOutput : undefined,
          errorMsg: c.errorMsg,
        };
      }),
    },
  };
}
