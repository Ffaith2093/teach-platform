import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Topbar } from "@/components/shell/topbar";
import { Trophy, FileText, GraduationCap, ChevronRight, TrendingUp, CheckCircle2 } from "lucide-react";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "成绩单" };

export default async function StudentGradesPage() {
  const session = await auth();
  const userId = session!.user.id;

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { classId: true },
  });
  if (!me?.classId) redirect("/dashboard");

  // 我所在班级的所有课程
  const courses = await prisma.course.findMany({
    where: { isArchived: false, classes: { some: { classId: me.classId } } },
    select: { id: true, title: true, category: true, semester: true },
    orderBy: [{ category: "asc" }, { createdAt: "desc" }],
  });

  // 每门课的成绩聚合
  const perCourse = await Promise.all(
    courses.map(async (c) => {
      const [assignmentSubs, examAttempts] = await Promise.all([
        prisma.assignmentSubmission.findMany({
          where: {
            studentId: userId,
            assignment: { courseId: c.id, publishedAt: { not: null } },
          },
          select: {
            id: true,
            status: true,
            autoScore: true,
            manualScore: true,
            finalScore: true,
            assignment: { select: { totalScore: true, title: true } },
            gradedAt: true,
          },
          orderBy: { gradedAt: "desc" },
        }),
        prisma.examAttempt.findMany({
          where: { studentId: userId, exam: { courseId: c.id } },
          select: {
            id: true,
            status: true,
            autoScore: true,
            manualScore: true,
            finalScore: true,
            submittedAt: true,
            exam: { select: { id: true, title: true, totalScore: true } },
          },
          orderBy: { submittedAt: "desc" },
        }),
      ]);
      const gradedAssignments = assignmentSubs.filter((s) => s.status === "GRADED");
      const gradedExams = examAttempts.filter((a) =>
        a.status === "GRADED" || a.status === "SUBMITTED",
      );
      const avgAssign =
        gradedAssignments.length === 0
          ? null
          : gradedAssignments.reduce(
              (acc, s) => acc + ((s.finalScore ?? 0) / (s.assignment.totalScore || 1)) * 100,
              0,
            ) / gradedAssignments.length;
      const avgExam =
        gradedExams.length === 0
          ? null
          : gradedExams.reduce(
              (acc, a) => acc + ((a.finalScore ?? a.autoScore ?? 0) / (a.exam.totalScore || 1)) * 100,
              0,
            ) / gradedExams.length;
      return { course: c, assignmentSubs, examAttempts, gradedAssignments, gradedExams, avgAssign, avgExam };
    }),
  );

  // 全局统计
  const allGradedAssign = perCourse.flatMap((p) => p.gradedAssignments);
  const allGradedExam = perCourse.flatMap((p) => p.gradedExams);
  const overallAssignAvg =
    allGradedAssign.length === 0
      ? null
      : allGradedAssign.reduce(
          (acc, s) => acc + ((s.finalScore ?? 0) / (s.assignment.totalScore || 1)) * 100,
          0,
        ) / allGradedAssign.length;
  const overallExamAvg =
    allGradedExam.length === 0
      ? null
      : allGradedExam.reduce(
          (acc, a) => acc + ((a.finalScore ?? a.autoScore ?? 0) / (a.exam.totalScore || 1)) * 100,
          0,
        ) / allGradedExam.length;

  const stats = [
    {
      icon: Trophy,
      label: "整体作业均分",
      value: overallAssignAvg == null ? "—" : `${Math.round(overallAssignAvg)}%`,
      sub: `${allGradedAssign.length} 次已批改`,
      tone: "primary" as const,
    },
    {
      icon: GraduationCap,
      label: "整体考试均分",
      value: overallExamAvg == null ? "—" : `${Math.round(overallExamAvg)}%`,
      sub: `${allGradedExam.length} 场已交卷`,
      tone: "success" as const,
    },
    {
      icon: CheckCircle2,
      label: "已批改作业",
      value: `${allGradedAssign.length}`,
      sub: `累计 ${perCourse.reduce((acc, p) => acc + p.assignmentSubs.length, 0)} 次提交`,
      tone: "muted" as const,
    },
    {
      icon: TrendingUp,
      label: "已完成考试",
      value: `${allGradedExam.length}`,
      sub: `累计 ${perCourse.reduce((acc, p) => acc + p.examAttempts.length, 0)} 次参考`,
      tone: "muted" as const,
    },
  ];

  return (
    <>
      <Topbar crumbs={[{ label: "成绩单" }]} />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">成绩单</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              按课程聚合您的作业与考试成绩。点击课程查看详情。
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {stats.map((s) => {
              const Icon = s.icon;
              return (
                <Card key={s.label}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <span className="text-sm text-muted-foreground">{s.label}</span>
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                          s.tone === "primary"
                            ? "bg-primary-subtle text-primary"
                            : s.tone === "success"
                              ? "bg-success-subtle text-success"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="mt-3 text-2xl font-bold tracking-tight num">{s.value}</div>
                    <p className="mt-1 text-xs text-subtle-foreground">{s.sub}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {perCourse.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <Trophy className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">暂无课程成绩</p>
                <p className="text-xs text-muted-foreground">请确认您班级已分配到课程</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                      <th className="px-6 py-3">课程</th>
                      <th className="px-6 py-3">作业</th>
                      <th className="px-6 py-3">作业均分</th>
                      <th className="px-6 py-3">考试</th>
                      <th className="px-6 py-3">考试均分</th>
                      <th className="px-6 py-3">最近活动</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {perCourse.map((p) => {
                      const lastAssign = p.assignmentSubs.find((s) => s.gradedAt);
                      const lastExam = p.examAttempts.find((a) => a.submittedAt);
                      const lastActivity = [
                        lastAssign?.gradedAt ? { at: lastAssign.gradedAt, kind: "作业" } : null,
                        lastExam?.submittedAt ? { at: lastExam.submittedAt, kind: "考试" } : null,
                      ]
                        .filter((x): x is { at: Date; kind: string } => x !== null)
                        .sort((a, b) => b.at.getTime() - a.at.getTime())[0];
                      return (
                        <tr key={p.course.id} className="group transition-colors hover:bg-muted/30">
                          <td className="px-6 py-3.5">
                            <Link
                              href={`/courses/${p.course.id}`}
                              className="font-medium text-foreground hover:text-primary"
                            >
                              {p.course.title}
                            </Link>
                            <div className="mt-0.5 text-[11px] text-subtle-foreground">{p.course.semester}</div>
                          </td>
                          <td className="px-6 py-3.5 num text-muted-foreground">
                            {p.gradedAssignments.length} / {p.assignmentSubs.length}
                          </td>
                          <td className="px-6 py-3.5">
                            {p.avgAssign == null ? (
                              <span className="text-subtle-foreground">—</span>
                            ) : (
                              <ScoreBadge value={p.avgAssign} />
                            )}
                          </td>
                          <td className="px-6 py-3.5 num text-muted-foreground">
                            {p.gradedExams.length} / {p.examAttempts.length}
                          </td>
                          <td className="px-6 py-3.5">
                            {p.avgExam == null ? (
                              <span className="text-subtle-foreground">—</span>
                            ) : (
                              <ScoreBadge value={p.avgExam} />
                            )}
                          </td>
                          <td className="px-6 py-3.5 text-xs text-muted-foreground">
                            {lastActivity ? (
                              <>
                                <div className="num">{formatDate(lastActivity.at)}</div>
                                <div className="text-[11px] text-subtle-foreground">{lastActivity.kind}</div>
                              </>
                            ) : (
                              <span className="text-subtle-foreground">暂无</span>
                            )}
                          </td>
                          <td className="px-2 py-3.5">
                            <ChevronRight className="h-4 w-4 text-subtle-foreground transition-colors group-hover:text-primary" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </>
  );
}

function ScoreBadge({ value }: { value: number }) {
  const variant = value >= 85 ? "success" : value >= 60 ? "warning" : "danger";
  return (
    <Badge variant={variant as "success" | "warning" | "danger"}>
      <span className="num">{Math.round(value)}</span>
      <span className="text-subtle-foreground">%</span>
    </Badge>
  );
}