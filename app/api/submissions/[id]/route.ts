/**
 * Submission 轮询路由（SPEC §3.1 step 5）
 *
 * 学生端 / 教师端拿评测结果用。前端每 1 秒轮询一次，最多 60 次。
 *
 * 鉴权：
 *   - submitter 本人
 *   - PRACTICE: problem.author 教师
 *   - ASSIGNMENT: 该作业所在课程的 CourseTeacher
 *   - EXAM: 该试卷所在课程的 CourseTeacher
 *
 * 隐藏用例的实际输出绝不返回（SPEC §3.1 红线）。
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const submission = await prisma.submission.findUnique({
    where: { id },
    include: {
      problem: {
        select: { id: true, authorId: true },
      },
      judgeCases: {
        orderBy: { testCase: { order: "asc" } },
        select: {
          status: true,
          timeMs: true,
          actualOutput: true,
          testCaseId: true,
          testCase: { select: { order: true, isSample: true } },
        },
      },
    },
  });
  if (!submission) {
    return NextResponse.json({ message: "提交不存在" }, { status: 404 });
  }

  // 鉴权
  const canView = await canUserViewSubmission(
    session.user.id,
    session.user.role,
    submission.userId,
    submission.contextType,
    submission.contextId,
    submission.problem.authorId,
  );
  if (!canView) {
    return NextResponse.json({ message: "无权查看" }, { status: 403 });
  }

  return NextResponse.json({
    id: submission.id,
    status: submission.status,
    score: submission.score,
    passedCount: submission.passedCount,
    totalCount: submission.totalCount,
    errorMsg: submission.errorMsg,
    maxTimeMs: submission.maxTimeMs,
    cases: submission.judgeCases.map((c) => ({
      testCaseId: c.testCaseId,
      order: c.testCase.order,
      isSample: c.testCase.isSample,
      status: c.status,
      timeMs: c.timeMs ?? 0,
      // 仅 sample 返回 actualOutput（隐藏用例绝不到学生端）
      actualOutput: c.actualOutput ?? undefined,
      errorMsg: submission.errorMsg ?? undefined,
    })),
  });
}

async function canUserViewSubmission(
  userId: string,
  role: string,
  submitterId: string,
  contextType: string,
  contextId: string | null,
  problemAuthorId: string,
): Promise<boolean> {
  // 提交者本人
  if (userId === submitterId) return true;
  // 管理员
  if (role === "ADMIN") return true;

  // 教师：看作者 / 课程成员
  if (role === "TEACHER") {
    // PRACTICE：题目作者
    if (contextType === "PRACTICE") {
      return userId === problemAuthorId;
    }
    // ASSIGNMENT：作业所在课程的教师
    if (contextType === "ASSIGNMENT" && contextId) {
      const assignment = await prisma.assignment.findUnique({
        where: { id: contextId },
        select: { courseId: true },
      });
      if (!assignment) return false;
      const member = await prisma.courseTeacher.findUnique({
        where: {
          courseId_teacherId: { courseId: assignment.courseId, teacherId: userId },
        },
      });
      return !!member;
    }
    // EXAM：试卷所在课程的教师
    if (contextType === "EXAM" && contextId) {
      const exam = await prisma.exam.findUnique({
        where: { id: contextId },
        select: { courseId: true },
      });
      if (!exam) return false;
      const member = await prisma.courseTeacher.findUnique({
        where: {
          courseId_teacherId: { courseId: exam.courseId, teacherId: userId },
        },
      });
      return !!member;
    }
  }

  return false;
}
