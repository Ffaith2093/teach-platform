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

  // 同班同学（含自己）— 用于班级排名 + 班级均分
  const classmates = await prisma.user.findMany({
    where: { classId: me.classId, role: "STUDENT", status: "ACTIVE" },
    select: { id: true },
  });
  const classmateIds = classmates.map((x) => x.id);
  const classSize = classmates.length;

  // 每门课的成绩聚合（含班级对比）
  const perCourse = await Promise.all(
    courses.map(async (c) => {
      // 自己的提交 + 全班的提交（一次拉，便于排名计算）
      const [myAssignSubs, myExamAttempts, classAssignSubs, classExamAttempts] =
        await Promise.all([
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
          prisma.assignmentSubmission.findMany({
            where: {
              assignment: { courseId: c.id, publishedAt: { not: null } },
              studentId: { in: classmateIds },
            },
            select: {
              studentId: true,
              status: true,
              autoScore: true,
              manualScore: true,
              finalScore: true,
              assignment: { select: { totalScore: true } },
            },
          }),
          prisma.examAttempt.findMany({
            where: { exam: { courseId: c.id }, studentId: { in: classmateIds } },
            select: {
              studentId: true,
              status: true,
              autoScore: true,
              manualScore: true,
              finalScore: true,
              exam: { select: { totalScore: true } },
            },
          }),
        ]);

      const gradedAssignments = myAssignSubs.filter((s) => s.status === "GRADED");
      const gradedExams = myExamAttempts.filter(
        (a) => a.status === "GRADED" || a.status === "SUBMITTED",
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

      // 班级作业 % 均分 + 个人排名（按已批改 finalScore 归一）
      const assignScoreOf = (s: (typeof classAssignSubs)[number]): number | null => {
        if (s.status !== "GRADED" && s.status !== "RETURNED") return null;
        if (s.finalScore != null) return s.finalScore;
        if (s.autoScore != null || s.manualScore != null)
          return (s.autoScore ?? 0) + (s.manualScore ?? 0);
        return null;
      };
      const assignByStudent = new Map<string, number[]>();
      for (const s of classAssignSubs) {
        const sc = assignScoreOf(s);
        if (sc == null) continue;
        const total = s.assignment.totalScore || 1;
        const arr = assignByStudent.get(s.studentId) ?? [];
        arr.push((sc / total) * 100);
        assignByStudent.set(s.studentId, arr);
      }
      const assignAvgByStudent = new Map<string, number>();
      for (const [sid, arr] of assignByStudent) {
        const sum = arr.reduce((a, b) => a + b, 0);
        assignAvgByStudent.set(sid, sum / arr.length);
      }
      // 班级总平均：所有学生的 % 平均再求平均（与 top stats 语义一致）
      const classAssignAvg =
        assignAvgByStudent.size === 0
          ? null
          : [...assignAvgByStudent.values()].reduce((a, b) => a + b, 0) /
            assignAvgByStudent.size;
      const myAssignAvg = assignAvgByStudent.get(userId) ?? null;
      const assignRank =
        myAssignAvg == null
          ? null
          : [...assignAvgByStudent.values()].filter((v) => v > myAssignAvg).length + 1;

      // 班级考试 % 均分 + 个人排名（finalScore 优先；无 final 时 autoScore+manualScore）
      const examScoreOf = (a: (typeof classExamAttempts)[number]): number | null => {
        if (a.status === "IN_PROGRESS") return null;
        if (a.finalScore != null) return a.finalScore;
        if (a.autoScore != null || a.manualScore != null)
          return Math.min((a.autoScore ?? 0) + (a.manualScore ?? 0), a.exam.totalScore || 1);
        return null;
      };
      const examByStudent = new Map<string, number[]>();
      for (const a of classExamAttempts) {
        const sc = examScoreOf(a);
        if (sc == null) continue;
        const total = a.exam.totalScore || 1;
        const arr = examByStudent.get(a.studentId) ?? [];
        arr.push((sc / total) * 100);
        examByStudent.set(a.studentId, arr);
      }
      const examAvgByStudent = new Map<string, number>();
      for (const [sid, arr] of examByStudent) {
        const sum = arr.reduce((a, b) => a + b, 0);
        examAvgByStudent.set(sid, sum / arr.length);
      }
      const classExamAvg =
        examAvgByStudent.size === 0
          ? null
          : [...examAvgByStudent.values()].reduce((a, b) => a + b, 0) /
            examAvgByStudent.size;
      const myExamAvg = examAvgByStudent.get(userId) ?? null;
      const examRank =
        myExamAvg == null
          ? null
          : [...examAvgByStudent.values()].filter((v) => v > myExamAvg).length + 1;

      return {
        course: c,
        assignmentSubs: myAssignSubs,
        examAttempts: myExamAttempts,
        gradedAssignments,
        gradedExams,
        avgAssign,
        avgExam,
        classAssignAvg,
        classExamAvg,
        myAssignAvg,
        myExamAvg,
        assignRank,
        examRank,
      };
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
      <main className="min-w-0 flex-1 p-4 md:p-8">
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
            <Card className="min-w-0 overflow-hidden">
              <CardContent className="overflow-x-auto p-0">
                <table className="min-w-[1120px] w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                      <th className="whitespace-nowrap px-6 py-3">课程</th>
                      <th className="whitespace-nowrap px-6 py-3">作业</th>
                      <th className="whitespace-nowrap px-6 py-3">作业均分</th>
                      <th className="whitespace-nowrap px-6 py-3">vs 班级</th>
                      <th className="whitespace-nowrap px-6 py-3">班级排名</th>
                      <th className="whitespace-nowrap px-6 py-3">考试</th>
                      <th className="whitespace-nowrap px-6 py-3">考试均分</th>
                      <th className="whitespace-nowrap px-6 py-3">vs 班级</th>
                      <th className="whitespace-nowrap px-6 py-3">班级排名</th>
                      <th className="whitespace-nowrap px-6 py-3">最近活动</th>
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
                          <td className="px-6 py-3.5">
                            <ClassCompare mine={p.myAssignAvg} classAvg={p.classAssignAvg} />
                          </td>
                          <td className="px-6 py-3.5">
                            <RankBadge rank={p.assignRank} total={classSize} />
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
                          <td className="px-6 py-3.5">
                            <ClassCompare mine={p.myExamAvg} classAvg={p.classExamAvg} />
                          </td>
                          <td className="px-6 py-3.5">
                            <RankBadge rank={p.examRank} total={classSize} />
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

/** 显示 "我 XX vs 班均 YY"，超出班均用 ▲/▼ 标记 */
function ClassCompare({ mine, classAvg }: { mine: number | null; classAvg: number | null }) {
  if (mine == null || classAvg == null) {
    return <span className="text-subtle-foreground">—</span>;
  }
  const delta = mine - classAvg;
  const sign = delta >= 0 ? "+" : "";
  const tone =
    Math.abs(delta) < 0.5
      ? "text-muted-foreground"
      : delta > 0
        ? "text-success"
        : "text-danger";
  const arrow = Math.abs(delta) < 0.5 ? "≈" : delta > 0 ? "▲" : "▼";
  return (
    <div className="flex min-w-[150px] flex-col whitespace-nowrap leading-tight">
      <span className="num text-foreground">
        {Math.round(mine)}
        <span className="ml-0.5 text-subtle-foreground">%</span>
      </span>
      <span className={`num text-[11px] ${tone}`}>
        {arrow} 班均 {Math.round(classAvg)}% ({sign}
        {Math.round(delta)})
      </span>
    </div>
  );
}

/** 班级排名：前 25% 绿，后 25% 红，中段 warning */
function RankBadge({ rank, total }: { rank: number | null; total: number }) {
  if (rank == null || total === 0) {
    return <span className="text-subtle-foreground">—</span>;
  }
  const pct = (rank - 1) / total; // 0 = 第一名，1 = 最后
  const variant =
    pct <= 0.25 ? "success" : pct >= 0.75 ? "danger" : "warning";
  return (
    <Badge className="whitespace-nowrap" variant={variant as "success" | "warning" | "danger"}>
      第 <span className="num">{rank}</span>
      <span className="text-subtle-foreground"> / {total}</span>
    </Badge>
  );
}
