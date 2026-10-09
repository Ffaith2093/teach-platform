/**
 * 作业提交批量导出 CSV
 * GET /api/assignments/[id]/submissions.csv
 *
 * 鉴权：TEACHER 必须在该作业所属课程的 CourseTeacher（OWNER/ASSISTANT）
 * 内容：每个学生一行，按班级/学号排序
 *      列：班级、学号、姓名、状态、总分、满分、是否迟交、提交时间、批改时间、
 *          [每道编程题一列，列名为「第N题 {title}(满分X)」]
 *
 * - UTF-8 BOM (`\uFEFF`) 前缀，避免 Excel 打开中文乱码
 * - 数值字段用 "" 表示缺省（避免 Excel 把 null 当 0 求和）
 * - 字段中的逗号/双引号/换行按 RFC 4180 转义
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { scoreAssignmentProblem } from "@/lib/assignments/scoring";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
  if (session.user.role !== "TEACHER") {
    return NextResponse.json({ message: "仅教师可导出" }, { status: 403 });
  }
  const { id } = await params;
  const userId = session.user.id;

  // 鉴权：必须是该作业所属课程的任课教师
  const assignment = await prisma.assignment.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      totalScore: true,
      dueAt: true,
      courseId: true,
      course: {
        select: {
          teachers: { where: { teacherId: userId }, select: { role: true } },
        },
      },
    },
  });
  if (!assignment) {
    return NextResponse.json({ message: "作业不存在" }, { status: 404 });
  }
  const role = assignment.course.teachers[0]?.role;
  if (role !== "OWNER" && role !== "ASSISTANT") {
    return NextResponse.json({ message: "无权访问该作业" }, { status: 403 });
  }

  // 按班级筛选：?classId=xxx,yyy — 多个用逗号分隔；空表示全部
  const classIdParam = new URL(req.url).searchParams.get("classId") ?? "";
  const requestedClassIds = Array.from(
    new Set(
      classIdParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );

  // 课程下被选中的班级（自动忽略不属于本课程的 classId）
  const courseClasses = await prisma.courseClass.findMany({
    where: {
      courseId: assignment.courseId,
      ...(requestedClassIds.length > 0
        ? { classId: { in: requestedClassIds } }
        : {}),
    },
    select: {
      classId: true,
      class: {
        select: {
          name: true,
          students: {
            where: { status: "ACTIVE", role: "STUDENT" },
            select: { id: true, name: true, studentNo: true },
            orderBy: [{ studentNo: "asc" }],
          },
        },
      },
    },
  });

  if (requestedClassIds.length > 0 && courseClasses.length === 0) {
    return NextResponse.json(
      { message: "指定的班级不属于本课程" },
      { status: 422 },
    );
  }

  const allStudents = courseClasses.flatMap((cc) =>
    cc.class.students.map((s) => ({
      id: s.id,
      name: s.name,
      studentNo: s.studentNo,
      className: cc.class.name,
    })),
  );
  if (allStudents.length === 0) {
    return new NextResponse("课程尚未绑定任何班级", { status: 422 });
  }

  // 提交记录 + 每道编程题
  const [submissions, problems] = await Promise.all([
    prisma.assignmentSubmission.findMany({
      where: {
        assignmentId: id,
        studentId: { in: allStudents.map((s) => s.id) },
      },
      select: {
        id: true,
        studentId: true,
        status: true,
        finalScore: true,
        submittedAt: true,
        gradedAt: true,
      },
    }),
    prisma.assignmentProblem.findMany({
      where: { assignmentId: id },
      orderBy: { order: "asc" },
      select: {
        problemId: true,
        score: true,
        order: true,
        problem: { select: { title: true, testCases: { select: { score: true } } } },
      },
    }),
  ]);

  const subByStudent = new Map(submissions.map((s) => [s.studentId, s]));
  const studentIds = submissions.map((s) => s.studentId);
  const problemIds = problems.map((p) => p.problemId);
  const perProblemSubs =
    studentIds.length > 0 && problemIds.length > 0
      ? await prisma.submission.findMany({
          where: {
            contextType: "ASSIGNMENT",
            contextId: id,
            userId: { in: studentIds },
            problemId: { in: problemIds },
          },
          orderBy: { createdAt: "desc" },
          select: {
            userId: true,
            problemId: true,
            passedCount: true,
            totalCount: true,
            status: true,
          },
        })
      : [];
  const scoreByKey = new Map<string, number>();
  for (const s of perProblemSubs) {
    const k = `${s.userId}:${s.problemId}`;
    if (!scoreByKey.has(k)) {
      const problem = problems.find((p) => p.problemId === s.problemId);
      if (problem) {
        scoreByKey.set(
          k,
          scoreAssignmentProblem(s.passedCount, s.totalCount, problem.score),
        );
      }
    }
  }

  // ===== CSV 构造 =====
  const STATUS_LABEL: Record<string, string> = {
    DRAFT: "草稿",
    SUBMITTED: "已提交",
    GRADED: "已批改",
    RETURNED: "已退回",
  };

  const fixedCols = [
    "班级",
    "学号",
    "姓名",
    "状态",
    "总分",
    "满分",
    "是否迟交",
    "提交时间",
    "批改时间",
  ];
  const problemHeaders = problems.map(
    (p) => `第${p.order + 1}题 ${p.problem.title.slice(0, 20)}(满分${p.score})`,
  );
  const header = [...fixedCols, ...problemHeaders];

  const rows: string[][] = [header];
  for (const s of allStudents) {
    const sub = subByStudent.get(s.id);
    const late = sub?.submittedAt ? sub.submittedAt > assignment.dueAt : false;
    const problemScores = problems.map((p) => {
      const cell = sub ? scoreByKey.get(`${sub.studentId}:${p.problemId}`) : undefined;
      return cell == null ? "" : String(cell);
    });
    rows.push([
      s.className,
      s.studentNo ?? "",
      s.name,
      sub ? STATUS_LABEL[sub.status] ?? sub.status : "未提交",
      sub?.finalScore != null ? String(sub.finalScore) : "",
      String(assignment.totalScore),
      late ? "是" : "否",
      sub?.submittedAt ? formatDate(sub.submittedAt) : "",
      sub?.gradedAt ? formatDate(sub.gradedAt) : "",
      ...problemScores,
    ]);
  }

  const csv = "\uFEFF" + rows.map((r) => r.map(escapeCell).join(",")).join("\r\n");
  const filenameSafe = assignment.title.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 40);
  const classTag =
    courseClasses.length === 1
      ? `_${courseClasses[0]!.class.name.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 16)}`
      : "";
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filenameSafe}${classTag}_submissions.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

/** RFC 4180: 含逗号/双引号/换行的字段用双引号包裹，内部双引号 → "" */
function escapeCell(v: string): string {
  if (v === "") return "";
  if (/[,"\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
