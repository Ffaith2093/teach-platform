"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/guard";
import { addJudgeJob } from "@/lib/judge/queue";
import { notifyMany } from "@/lib/notifications";

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
    return { error: "评测队列暂时不可用，请稍后再试" };
  }

  revalidatePath(`/assignments/${parsed.data.assignmentId}`);
  revalidatePath(`/t/assignments/${parsed.data.assignmentId}`);

  return { ok: true, submissionId: submission.id };
}
