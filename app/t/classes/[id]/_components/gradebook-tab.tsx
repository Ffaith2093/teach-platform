import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { BookOpen, FileText, GraduationCap, ListChecks } from "lucide-react";
import {
  buildAssignmentGradebook,
  buildExamGradebook,
  type Gradebook,
  type GradebookCellValue,
  type GradebookStudent,
} from "@/lib/analytics/gradebook";
import { formatDate } from "@/lib/utils";

type Kind = "assignment" | "exam";

const KIND_LABEL: Record<Kind, string> = {
  assignment: "作业",
  exam: "考试",
};

type Tone = "danger" | "warning" | "primary" | "success" | "muted";

function scoreTone(value: number | null, total: number): Tone {
  if (value == null || total <= 0) return "muted";
  const rate = value / total;
  if (rate < 0.4) return "danger";
  if (rate < 0.6) return "warning";
  if (rate < 0.8) return "primary";
  return "success";
}

const TONE_TEXT: Record<Tone, string> = {
  danger: "text-danger",
  warning: "text-warning",
  primary: "text-primary",
  success: "text-success",
  muted: "text-muted-foreground",
};

export async function GradebookTab({
  classId,
  searchParams,
}: {
  classId: string;
  searchParams: { courseId?: string; kind?: string };
}) {
  // 1. 班级所关联的课程列表（教师可切换）
  const courseClasses = await prisma.courseClass.findMany({
    where: { classId },
    include: {
      course: { select: { id: true, title: true } },
    },
    orderBy: { addedAt: "asc" },
  });

  if (courseClasses.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <BookOpen className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">本班暂未关联任何课程</p>
          <p className="text-xs text-muted-foreground">先去「所属课程」页添加课程。</p>
        </CardContent>
      </Card>
    );
  }

  const courseIds = courseClasses.map((cc) => cc.courseId);
  const selectedCourseId = courseIds.includes(searchParams.courseId ?? "")
    ? (searchParams.courseId as string)
    : courseIds[0];
  const selectedCourse = courseClasses.find((cc) => cc.courseId === selectedCourseId)!.course;

  const kind: Kind = searchParams.kind === "exam" ? "exam" : "assignment";

  // 2. 学生列表
  const students: GradebookStudent[] = (
    await prisma.user.findMany({
      where: { classId, role: "STUDENT", status: "ACTIVE" },
      select: { id: true, name: true, studentNo: true },
      orderBy: [{ studentNo: "asc" }],
    })
  ).map((s) => ({
    id: s.id,
    name: s.name,
    studentNo: s.studentNo,
  }));

  if (students.length === 0) {
    return (
      <>
        <FilterBar
          classId={classId}
          courseClasses={courseClasses}
          selectedCourseId={selectedCourseId}
          kind={kind}
        />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <GraduationCap className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">本班暂无在读学生</p>
          </CardContent>
        </Card>
      </>
    );
  }

  const studentIds = students.map((s) => s.id);

  // 3. 根据 kind 抓取作业 / 试卷 + 提交 / 尝试
  let gradebook: Gradebook;
  let emptyHint: string;
  let emptyIcon: React.ReactNode;

  if (kind === "assignment") {
    const assignments = await prisma.assignment.findMany({
      where: { courseId: selectedCourseId, publishedAt: { not: null } },
      select: { id: true, title: true, totalScore: true, dueAt: true },
      orderBy: { dueAt: "desc" },
      take: 8,
    });
    if (assignments.length === 0) {
      emptyHint = `${selectedCourse.title} 暂无已发布作业`;
      emptyIcon = <FileText className="h-10 w-10 text-muted-foreground" />;
      return (
        <>
          <FilterBar
            classId={classId}
            courseClasses={courseClasses}
            selectedCourseId={selectedCourseId}
            kind={kind}
          />
          <Card>
            <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              {emptyIcon}
              <p className="text-sm font-medium text-foreground">{emptyHint}</p>
            </CardContent>
          </Card>
        </>
      );
    }
    const submissions = await prisma.assignmentSubmission.findMany({
      where: {
        assignmentId: { in: assignments.map((a) => a.id) },
        studentId: { in: studentIds },
      },
      select: {
        assignmentId: true,
        studentId: true,
        finalScore: true,
        manualScore: true,
        autoScore: true,
        status: true,
      },
    });
    gradebook = buildAssignmentGradebook(students, assignments, submissions);
  } else {
    const exams = await prisma.exam.findMany({
      where: { courseId: selectedCourseId, status: { in: ["PUBLISHED", "CLOSED"] } },
      select: { id: true, title: true, totalScore: true, openAt: true },
      orderBy: { openAt: "desc" },
      take: 8,
    });
    if (exams.length === 0) {
      emptyHint = `${selectedCourse.title} 暂无已发布试卷`;
      emptyIcon = <ListChecks className="h-10 w-10 text-muted-foreground" />;
      return (
        <>
          <FilterBar
            classId={classId}
            courseClasses={courseClasses}
            selectedCourseId={selectedCourseId}
            kind={kind}
          />
          <Card>
            <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              {emptyIcon}
              <p className="text-sm font-medium text-foreground">{emptyHint}</p>
            </CardContent>
          </Card>
        </>
      );
    }
    const attempts = await prisma.examAttempt.findMany({
      where: {
        examId: { in: exams.map((e) => e.id) },
        studentId: { in: studentIds },
      },
      select: {
        examId: true,
        studentId: true,
        finalScore: true,
        autoScore: true,
        manualScore: true,
        status: true,
      },
    });
    gradebook = buildExamGradebook(students, exams, attempts);
  }

  return (
    <div className="space-y-4">
      <FilterBar
        classId={classId}
        courseClasses={courseClasses}
        selectedCourseId={selectedCourseId}
        kind={kind}
      />

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>
          共 <span className="num font-medium text-foreground">{gradebook.columns.length}</span> 项 ·
          班级平均{" "}
          <span className="num font-medium text-foreground">
            {gradebook.overallAverage != null ? gradebook.overallAverage.toFixed(1) : "—"}
          </span>
        </span>
      </div>

      <Card className="overflow-hidden">
        <div className="max-w-full overflow-x-auto">
          <table className="border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th
                  className="sticky left-0 z-10 border-b border-r border-border bg-muted/60 px-4 py-2.5 text-left text-xs font-medium text-muted-foreground"
                  style={{ minWidth: 160 }}
                >
                  学生
                </th>
                {gradebook.columns.map((col) => (
                  <th
                    key={col.id}
                    className="border-b border-r border-border bg-muted/60 px-2 py-2.5 text-center text-xs font-medium text-muted-foreground"
                    style={{ minWidth: 88 }}
                    title={`${col.title} · 总分 ${col.totalScore} · ${formatDate(col.at)}`}
                  >
                    <div className="line-clamp-2 text-foreground">{col.title}</div>
                    <div className="mt-0.5 text-[10px] font-normal num text-muted-foreground">
                      / {col.totalScore}
                    </div>
                  </th>
                ))}
                <th
                  className="sticky right-0 z-10 border-b border-l border-border bg-muted/60 px-3 py-2.5 text-center text-xs font-medium text-muted-foreground"
                  style={{ minWidth: 80 }}
                >
                  平均
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {gradebook.rows.map((row) => (
                <tr key={row.student.id} className="hover:bg-muted/30">
                  <td className="sticky left-0 z-10 border-r border-border bg-card px-4 py-2.5 hover:bg-muted/30">
                    <div className="num font-mono text-[11px] text-muted-foreground">
                      {row.student.studentNo ?? "—"}
                    </div>
                    <div className="text-sm font-medium text-foreground">{row.student.name}</div>
                  </td>
                  {gradebook.columns.map((col) => {
                    const cell = row.cells.get(col.id);
                    return <CellTd key={col.id} cell={cell} total={col.totalScore} />;
                  })}
                  <td className="sticky right-0 z-10 border-l border-border bg-card px-3 py-2.5 text-center hover:bg-muted/30">
                    <span className="num text-sm font-semibold text-foreground">
                      {row.averageScore != null ? row.averageScore.toFixed(1) : "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/40">
                <td className="sticky left-0 z-10 border-r border-t border-border bg-muted/60 px-4 py-2.5 text-xs font-medium text-muted-foreground">
                  班级平均
                </td>
                {gradebook.columns.map((col) => {
                  const avg = gradebook.classAverage.get(col.id);
                  return (
                    <td
                      key={col.id}
                      className="border-r border-t border-border bg-muted/40 px-2 py-2.5 text-center"
                    >
                      {avg != null ? (
                        <span
                          className={`num text-sm font-semibold ${TONE_TEXT[scoreTone(avg, col.totalScore)]}`}
                        >
                          {avg.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  );
                })}
                <td className="sticky right-0 z-10 border-l border-t border-border bg-muted/60 px-3 py-2.5 text-center">
                  <span className="num text-sm font-bold text-foreground">
                    {gradebook.overallAverage != null
                      ? gradebook.overallAverage.toFixed(1)
                      : "—"}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}

function CellTd({ cell, total }: { cell: GradebookCellValue | undefined; total: number }) {
  if (!cell || cell.score == null) {
    return (
      <td className="border-r border-border px-2 py-2.5 text-center">
        <span className="text-xs text-muted-foreground">未交</span>
      </td>
    );
  }
  const tone = scoreTone(cell.score, total);
  return (
    <td className="border-r border-border px-2 py-2.5 text-center">
      <span className={`num text-sm font-medium ${TONE_TEXT[tone]}`}>
        {cell.score}
        {cell.status === "SUBMITTED" && (
          <span className="ml-0.5 text-[10px] text-muted-foreground" title="已提交未批改">
            ·
          </span>
        )}
      </span>
    </td>
  );
}

function FilterBar({
  classId,
  courseClasses,
  selectedCourseId,
  kind,
}: {
  classId: string;
  courseClasses: Array<{ courseId: string; course: { title: string } }>;
  selectedCourseId: string;
  kind: Kind;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {courseClasses.map((cc) => {
          const active = cc.courseId === selectedCourseId;
          return (
            <Link
              key={cc.courseId}
              href={`/t/classes/${classId}?tab=gradebook&courseId=${cc.courseId}&kind=${kind}`}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors ${
                active
                  ? "border-primary bg-primary-subtle text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              <BookOpen className="h-3 w-3" />
              {cc.course.title}
            </Link>
          );
        })}
      </div>
      <div className="inline-flex items-center rounded-md border border-border bg-card p-0.5">
        {(["assignment", "exam"] as const).map((k) => {
          const active = k === kind;
          return (
            <Link
              key={k}
              href={`/t/classes/${classId}?tab=gradebook&courseId=${selectedCourseId}&kind=${k}`}
              className={`inline-flex items-center gap-1 rounded px-3 py-1 text-xs transition-colors ${
                active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {k === "assignment" ? (
                <FileText className="h-3 w-3" />
              ) : (
                <ListChecks className="h-3 w-3" />
              )}
              {KIND_LABEL[k]}
            </Link>
          );
        })}
      </div>
    </div>
  );
}