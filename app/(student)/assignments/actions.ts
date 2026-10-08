"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/guard";
import { addJudgeJob } from "@/lib/judge/queue";
import { notifyMany } from "@/lib/notifications";
import { recordAccess } from "@/lib/access-log";
import { runSandbox } from "@/lib/judge/sandbox";
import type { JudgeRunResult } from "@/lib/judge/local";
import { writeFile, unlink } from "node:fs/promises";
import { extname, join } from "node:path";
import { ensureCourseDir, generateStoredName } from "@/lib/storage";
import { scoreAssignmentAnswers } from "@/lib/assignments/scoring";
import { scaledProblemScore } from "@/lib/exams/scoring";

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
    select: { classId: true, name: true },
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
    studentName: student.name,
    studentClassId: student.classId,
    assignmentProblem,
    assignment: assignmentProblem.assignment,
  };
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
  /** PENDING submission id；前端拿这个 id 去 /api/submissions/[id] 轮询 */
  submissionId?: string;
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
  const { studentId, assignment } = ctx;

  // 截止时间 / 迟交策略
  const now = new Date();
  if (assignment.dueAt < now && !assignment.allowLate) {
    return { error: "作业已截止且不允许迟交" };
  }

  // 取题目（仅需 testCases 数量）
  const problem = await prisma.problem.findUnique({
    where: { id: parsed.data.problemId },
    select: { testCases: { select: { id: true } } },
  });
  if (!problem) return { error: "题目不存在" };

  // 1) 创建 PENDING 提交
  const submission = await prisma.submission.create({
    data: {
      problemId: parsed.data.problemId,
      userId: studentId,
      code: parsed.data.code,
      status: "PENDING",
      totalCount: problem.testCases.length,
      contextType: "ASSIGNMENT",
      contextId: parsed.data.assignmentId,
    },
    select: { id: true },
  });

  // 2) 立即把 AssignmentSubmission 标 SUBMITTED（避免「交了但还没评测」时教师端看不到记录）
  //    用 updateMany(where: RETURNED) 节流：多题作业多次提交时仅第一次 RETURNED→SUBMITTED 返回 count=1
  const resubmitUpdate = await prisma.assignmentSubmission.updateMany({
    where: {
      assignmentId: parsed.data.assignmentId,
      studentId,
      status: "RETURNED",
    },
    data: { status: "SUBMITTED", submittedAt: now },
  });
  const isResubmit = resubmitUpdate.count === 1;
  if (!isResubmit) {
    // DRAFT 或不存在 → 走原 upsert 路径
    await prisma.assignmentSubmission.upsert({
      where: { assignmentId_studentId: { assignmentId: parsed.data.assignmentId, studentId } },
      update: { status: "SUBMITTED", submittedAt: now },
      create: {
        assignmentId: parsed.data.assignmentId,
        studentId,
        status: "SUBMITTED",
        submittedAt: now,
      },
    });
  }

  // 3) 重新提交通知（仅 RETURNED → SUBMITTED 触发；多题作业通过节流只发一次）
  if (isResubmit) {
    try {
      const teachers = await prisma.courseTeacher.findMany({
        where: {
          courseId: assignment.courseId,
          role: { in: ["OWNER", "ASSISTANT"] },
          teacher: { status: "ACTIVE" },
        },
        select: { teacherId: true },
      });
      if (teachers.length > 0) {
        await notifyMany({
          userIds: teachers.map((t) => t.teacherId),
          title: `${ctx.studentName} 重新提交了《${assignment.title}》`,
          body: "点击查看最新代码",
          href: `/t/assignments/${parsed.data.assignmentId}/grade`,
          courseId: assignment.courseId,
        });
      }
    } catch (e) {
      console.error("[submitProblemAction] resubmit notify failed:", e);
    }
  }

  // 3) 入队（Worker 跑评测 + 重算 AssignmentSubmission.autoScore）
  try {
    await addJudgeJob(submission.id);
  } catch (e) {
    console.error("[submitProblemAction] addJudgeJob failed:", e);
    await prisma.submission.update({
      where: { id: submission.id },
      data: { status: "SYSTEM_ERROR", errorMsg: "评测队列暂时不可用" },
    });
    return { error: "评测队列暂时不可用，请稍后再试" };
  }

  // 4) 出勤打点：每次提交算一次 AccessLog（出勤页按日去重，多题作业一天多条不影响「到课」判定）
  void recordAccess({
    userId: studentId,
    courseId: assignment.courseId,
  });

  revalidatePath(`/assignments/${parsed.data.assignmentId}`);
  revalidatePath(`/t/assignments/${parsed.data.assignmentId}`);

  return { ok: true, submissionId: submission.id };
}

export type SubmitAssignmentContentState = { ok?: true; error?: string };

export async function submitAssignmentContentAction(
  _prev: SubmitAssignmentContentState,
  formData: FormData,
): Promise<SubmitAssignmentContentState> {
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const session = await requireStudent();
  const student = await prisma.user.findUnique({ where: { id: session.user.id }, select: { classId: true } });
  if (!assignmentId || !student?.classId) return { error: "作业或班级信息无效" };

  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      questions: { include: { question: { select: { type: true, answer: true } } } },
      problems: { select: { problemId: true, score: true } },
    },
  });
  if (!assignment?.publishedAt) return { error: "作业不存在或尚未发布" };
  const accessible = await prisma.courseClass.findFirst({ where: { courseId: assignment.courseId, classId: student.classId } });
  if (!accessible) return { error: "您不在此作业关联的班级中" };
  const now = new Date();
  if (assignment.dueAt < now && !assignment.allowLate) return { error: "作业已截止且不允许迟交" };

  let answers: Record<string, unknown> = {};
  try {
    answers = JSON.parse(String(formData.get("answers") ?? "{}"));
  } catch {
    return { error: "答题数据格式错误" };
  }
  for (const item of assignment.questions) {
    const value = answers[item.questionId];
    const missing = Array.isArray(value) ? value.some((part) => !String(part ?? "").trim()) : !String(value ?? "").trim();
    if (missing) return { error: "请完成所有选择题和填空题" };
  }

  const surveyText = String(formData.get("surveyText") ?? "").trim();
  if (assignment.allowSurvey && !surveyText) return { error: "请填写评价问卷" };
  if (surveyText.length > 10000) return { error: "评价问卷内容不能超过 10000 字" };

  const existing = await prisma.assignmentSubmission.findUnique({
    where: { assignmentId_studentId: { assignmentId, studentId: session.user.id } },
    select: { id: true, fileUrl: true },
  });
  const file = formData.get("attachment");
  let fileData: { fileUrl: string; fileName: string; fileMimeType: string; fileSizeBytes: number } | null = null;
  if (file instanceof File && file.size > 0) {
    const ext = extname(file.name).slice(1).toLowerCase();
    if (!assignment.allowAttachment) return { error: "此作业不接受附件" };
    if (!assignment.allowedFileExtensions.includes(ext)) return { error: `附件仅支持：${assignment.allowedFileExtensions.map((item) => `.${item}`).join("、")}` };
    if (file.size > assignment.maxFileSizeMb * 1024 * 1024) return { error: `附件不能超过 ${assignment.maxFileSizeMb}MB` };
    const storedName = generateStoredName(ext);
    const directory = await ensureCourseDir(assignment.courseId);
    await writeFile(join(directory, storedName), Buffer.from(await file.arrayBuffer()));
    fileData = { fileUrl: storedName, fileName: file.name, fileMimeType: file.type || "application/octet-stream", fileSizeBytes: file.size };
  } else if (assignment.allowAttachment && !existing?.fileUrl) {
    return { error: "请选择要提交的附件" };
  }

  const objectiveScore = scoreAssignmentAnswers(assignment.questions, answers);
  let programmingScore = 0;
  for (const problem of assignment.problems) {
    const latest = await prisma.submission.findFirst({
      where: { problemId: problem.problemId, userId: session.user.id, contextType: "ASSIGNMENT", contextId: assignmentId },
      orderBy: { createdAt: "desc" },
      select: { score: true, problem: { select: { testCases: { select: { score: true } } } } },
    });
    const possible = latest?.problem.testCases.reduce((sum, testCase) => sum + testCase.score, 0) ?? 0;
    programmingScore += scaledProblemScore(latest?.score ?? 0, possible, problem.score);
  }

  await prisma.assignmentSubmission.upsert({
    where: { assignmentId_studentId: { assignmentId, studentId: session.user.id } },
    create: {
      assignmentId,
      studentId: session.user.id,
      answers: answers as never,
      textContent: assignment.allowSurvey ? surveyText : null,
      ...fileData,
      autoScore: objectiveScore + programmingScore,
      status: "SUBMITTED",
      submittedAt: now,
    },
    update: {
      answers: answers as never,
      textContent: assignment.allowSurvey ? surveyText : null,
      ...(fileData ?? {}),
      autoScore: objectiveScore + programmingScore,
      status: "SUBMITTED",
      submittedAt: now,
      manualScore: null,
      finalScore: null,
      gradedAt: null,
    },
  });
  if (fileData && existing?.fileUrl && existing.fileUrl !== fileData.fileUrl) {
    const directory = await ensureCourseDir(assignment.courseId);
    await unlink(join(directory, existing.fileUrl)).catch(() => undefined);
  }
  revalidatePath(`/assignments/${assignmentId}`);
  revalidatePath(`/t/assignments/${assignmentId}`);
  revalidatePath(`/t/assignments/${assignmentId}/grade`);
  return { ok: true };
}

// ========== 运行样例（不进队列，不写 Submission）==========

const runAssignmentSampleSchema = z.object({
  assignmentId: z.string().min(1),
  problemId: z.string().min(1),
  code: z.string().min(1, "请输入代码").max(50000, "代码过长（>50KB）"),
});

export type RunAssignmentSampleState =
  | { ok: true; result: JudgeRunResult; error?: undefined }
  | { ok?: false; error: string; result?: undefined };

export async function runAssignmentSampleAction(
  input: { assignmentId: string; problemId: string; code: string },
): Promise<RunAssignmentSampleState> {
  const parsed = runAssignmentSampleSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "请检查输入" };
  }

  let ctx;
  try {
    ctx = await requireAssignmentForStudent(
      parsed.data.assignmentId,
      parsed.data.problemId,
    );
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
      timeLimitMs: problem.timeLimitMs,
      memoryLimitMb: problem.memoryLimitMb,
      splitInputByWhitespace: problem.splitInputByWhitespace,
    },
  );

  return { ok: true, result };
}
