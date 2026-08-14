import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Topbar } from "@/components/shell/topbar";
import {
  BarChart3,
  BookOpen,
  Users,
  FileText,
  GraduationCap,
  ChevronRight,
  AlertCircle,
  TrendingUp,
  ClipboardCheck,
} from "lucide-react";

export const metadata = { title: "成绩分析" };
export const dynamic = "force-dynamic";

type CourseMetric = {
  id: string;
  title: string;
  classCount: number;
  studentCount: number;
  /** 进行中作业（已发布且未到 dueAt） */
  activeAssignments: number;
  /** 已截止作业（已发布且已到 dueAt，30 天内） */
  closedAssignments: number;
  /** 30 天内作业平均分（取已 GRADED 的 finalScore） */
  assignmentAvg: number | null;
  /** 30 天内作业应交 vs 已交 比 */
  assignmentCompletion: { submitted: number; expected: number };
  /** 30 天内已结束（closeAt &lt; now）的考试 */
  closedExams: number;
  /** 30 天内考试均分（已 GRADED 的 finalScore） */
  examAvg: number | null;
  /** 30 天内考试及格率（&gt;= 总分 60%） */
  examPassRate: number | null;
  hasActiveExam: boolean;
};

export default async function TeacherAnalyticsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "TEACHER") redirect("/t/dashboard?error=forbidden");
  const userId = session.user.id;

  // 我作为主讲/助教的未归档课程
  const memberships = await prisma.courseTeacher.findMany({
    where: { teacherId: userId, role: { in: ["OWNER", "ASSISTANT"] } },
    select: {
      role: true,
      courseId: true,
      course: { select: { id: true, title: true, isArchived: true } },
    },
  });
  const myCourses = memberships
    .filter((m) => !m.course.isArchived)
    .map((m) => m.course);
  const myCourseIds = myCourses.map((c) => c.id);

  if (myCourseIds.length === 0) {
    return (
      <>
        <Topbar crumbs={[{ label: "成绩分析" }]} />
        <main className="flex-1 p-8">
          <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
            <h1 className="text-2xl font-semibold tracking-tight">成绩分析</h1>
            <Card>
              <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  您尚未加入任何课程
                </p>
                <p className="text-xs text-muted-foreground">
                  请联系管理员把您加入课程后再来查看成绩分析。
                </p>
              </CardContent>
            </Card>
          </div>
        </main>
      </>
    );
  }

  const now = new Date();
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // 课程班级 + 学生（去重）
  const courseClasses = await prisma.courseClass.findMany({
    where: { courseId: { in: myCourseIds } },
    select: {
      courseId: true,
      class: {
        select: {
          students: {
            where: { status: "ACTIVE", role: "STUDENT" },
            select: { id: true },
          },
        },
      },
    },
  });
  const studentsByCourse = new Map<string, Set<string>>();
  for (const cc of courseClasses) {
    let set = studentsByCourse.get(cc.courseId);
    if (!set) {
      set = new Set<string>();
      studentsByCourse.set(cc.courseId, set);
    }
    for (const s of cc.class.students) set.add(s.id);
  }
  const classCountByCourse = new Map<string, number>();
  for (const cc of courseClasses) {
    classCountByCourse.set(cc.courseId, (classCountByCourse.get(cc.courseId) ?? 0) + 1);
  }

  // 作业：进行中 vs 已截止（过去 30 天）
  const assignments = await prisma.assignment.findMany({
    where: { courseId: { in: myCourseIds } },
    select: {
      id: true,
      courseId: true,
      title: true,
      publishedAt: true,
      dueAt: true,
    },
  });
  const assignmentByCourse = new Map<string, typeof assignments>();
  for (const a of assignments) {
    const arr = assignmentByCourse.get(a.courseId) ?? [];
    arr.push(a);
    assignmentByCourse.set(a.courseId, arr);
  }

  // AssignmentSubmission 聚合：按 assignmentId 计算 submitted / total / finalScore sum & count for 平均分
  const assignmentIds = assignments.map((a) => a.id);
  const subsByAssignment =
    assignmentIds.length > 0
      ? await prisma.assignmentSubmission.groupBy({
          by: ["assignmentId"],
          where: {
            assignmentId: { in: assignmentIds },
            status: { in: ["SUBMITTED", "GRADED", "RETURNED"] },
          },
          _count: { _all: true },
        })
      : [];
  const assignmentSubIds = await prisma.assignmentSubmission.findMany({
    where: {
      assignmentId: { in: assignmentIds },
      status: { in: ["SUBMITTED", "GRADED", "RETURNED"] },
    },
    select: { id: true, assignmentId: true, finalScore: true },
  });
  const subCountByAssignment = new Map(
    subsByAssignment.map((s) => [s.assignmentId, s._count._all]),
  );
  const finalScoreByAssignment = new Map<string, { sum: number; n: number }>();
  for (const s of assignmentSubIds) {
    if (s.finalScore == null) continue;
    const cur = finalScoreByAssignment.get(s.assignmentId) ?? { sum: 0, n: 0 };
    cur.sum += s.finalScore;
    cur.n++;
    finalScoreByAssignment.set(s.assignmentId, cur);
  }

  // 考试：30 天内进行过 + 当前是否 active
  const exams = await prisma.exam.findMany({
    where: { courseId: { in: myCourseIds }, status: "PUBLISHED" },
    select: {
      id: true,
      courseId: true,
      title: true,
      totalScore: true,
      openAt: true,
      closeAt: true,
    },
  });
  const examIds = exams.map((e) => e.id);
  const examAttempts =
    examIds.length > 0
      ? await prisma.examAttempt.findMany({
          where: {
            examId: { in: examIds },
            status: { in: ["SUBMITTED", "GRADING", "GRADED"] },
            finalScore: { not: null },
          },
          select: { examId: true, finalScore: true },
        })
      : [];
  // 限定到过去 30 天内已结束的考试
  const recentExamIds = new Set(
    exams
      .filter((e) => e.closeAt >= since && e.closeAt <= now)
      .map((e) => e.id),
  );
  type Aggregator = { sum: number; n: number; pass: number };
  const statsByExam = new Map<string, Aggregator>();
  for (const a of examAttempts) {
    if (!recentExamIds.has(a.examId)) continue;
    const cur = statsByExam.get(a.examId) ?? { sum: 0, n: 0, pass: 0 };
    cur.sum += a.finalScore ?? 0;
    cur.n++;
    statsByExam.set(a.examId, cur);
  }
  // pass 的判定需要 totalScore — 用 lookup 表
  const totalScoreByExam = new Map(exams.map((e) => [e.id, e.totalScore]));
  for (const [eid, agg] of statsByExam) {
    const total = totalScoreByExam.get(eid) ?? 0;
    if (total > 0) {
      // 重新算 pass：>= 60% 总分
      const passCount = examAttempts.filter(
        (a) =>
          a.examId === eid &&
          a.finalScore != null &&
          a.finalScore >= total * 0.6,
      ).length;
      agg.pass = passCount;
    }
  }

  // ===== 汇总到课程 =====
  const courseMetrics: CourseMetric[] = myCourses.map((c) => {
    const courseAssignments = assignmentByCourse.get(c.id) ?? [];
    const activeAssignments = courseAssignments.filter(
      (a) => a.publishedAt && a.dueAt >= now,
    ).length;
    const closedAssignments = courseAssignments.filter(
      (a) =>
        a.publishedAt && a.dueAt < now && a.dueAt >= since,
    ).length;

    const recentClosedAssignIds = courseAssignments
      .filter((a) => a.publishedAt && a.dueAt < now && a.dueAt >= since)
      .map((a) => a.id);
    const studentIds = studentsByCourse.get(c.id) ?? new Set<string>();
    const expectedFromClosed =
      recentClosedAssignIds.length * studentIds.size;
    const submittedFromClosed = recentClosedAssignIds.reduce(
      (sum, id) => sum + (subCountByAssignment.get(id) ?? 0),
      0,
    );
    const finalScoresSum = recentClosedAssignIds.reduce(
      (s, id) => s + (finalScoreByAssignment.get(id)?.sum ?? 0),
      0,
    );
    const finalScoresN = recentClosedAssignIds.reduce(
      (n, id) => n + (finalScoreByAssignment.get(id)?.n ?? 0),
      0,
    );
    const assignmentAvg = finalScoresN > 0 ? finalScoresSum / finalScoresN : null;
    const assignmentCompletion = {
      submitted: submittedFromClosed,
      expected: expectedFromClosed,
    };

    const courseExamIds = exams.filter((e) => e.courseId === c.id).map((e) => e.id);
    const courseExamStats = courseExamIds
      .map((eid) => statsByExam.get(eid))
      .filter((x): x is Aggregator => x != null);
    const closedExams = courseExamIds.filter((eid) => recentExamIds.has(eid)).length;
    const examsSum = courseExamStats.reduce((s, x) => s + x.sum, 0);
    const examsN = courseExamStats.reduce((s, x) => s + x.n, 0);
    const examsPass = courseExamStats.reduce((s, x) => s + x.pass, 0);
    const examAvg = examsN > 0 ? examsSum / examsN : null;
    const examPassRate = examsN > 0 ? examsPass / examsN : null;

    const hasActiveExam = exams.some(
      (e) => e.courseId === c.id && e.openAt <= now && e.closeAt >= now,
    );

    return {
      id: c.id,
      title: c.title,
      classCount: classCountByCourse.get(c.id) ?? 0,
      studentCount: studentIds.size,
      activeAssignments,
      closedAssignments,
      assignmentAvg,
      assignmentCompletion,
      closedExams,
      examAvg,
      examPassRate,
      hasActiveExam,
    };
  });

  const totalStudents = new Set<string>();
  for (const s of studentsByCourse.values()) for (const id of s) totalStudents.add(id);
  const totalActiveAssignments = courseMetrics.reduce((s, x) => s + x.activeAssignments, 0);
  const totalClosedAssignments = courseMetrics.reduce((s, x) => s + x.closedAssignments, 0);
  const recentAssignmentAvg = (() => {
    let sum = 0;
    let n = 0;
    for (const m of courseMetrics) {
      if (m.assignmentAvg != null) {
        // 按课程平均（简单加权）
        sum += m.assignmentAvg;
        n++;
      }
    }
    return n > 0 ? sum / n : null;
  })();
  const recentExamAvg = (() => {
    let sum = 0;
    let n = 0;
    for (const m of courseMetrics) {
      if (m.examAvg != null) {
        sum += m.examAvg;
        n++;
      }
    }
    return n > 0 ? sum / n : null;
  })();

  const stats = [
    {
      icon: Users,
      label: "学生总数",
      num: totalStudents.size,
      hint: `覆盖 ${courseMetrics.length} 门课`,
      tone: "primary" as const,
    },
    {
      icon: FileText,
      label: "进行中作业",
      num: totalActiveAssignments,
      hint: `近 30 天截止 ${totalClosedAssignments} 项`,
      tone: "warning" as const,
    },
    {
      icon: TrendingUp,
      label: "近 30 天作业均分",
      num: recentAssignmentAvg == null ? "—" : recentAssignmentAvg.toFixed(1),
      hint: "已批改样本",
      tone: "muted" as const,
    },
    {
      icon: GraduationCap,
      label: "近 30 天考试均分",
      num: recentExamAvg == null ? "—" : recentExamAvg.toFixed(1),
      hint: exams.length === 0 ? "暂无考试" : `覆盖 ${exams.length} 场考试`,
      tone: "muted" as const,
    },
  ];

  return (
    <>
      <Topbar crumbs={[{ label: "成绩分析" }]} />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">成绩分析</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              按课程汇总近 30 天的作业完成率与考试通过率，帮助定位薄弱教学环节。
            </p>
          </div>

          {/* 概览 4 卡 */}
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
                            : s.tone === "warning"
                              ? "bg-warning-subtle text-warning"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="mt-3 num text-3xl font-bold tracking-tight">{s.num}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{s.hint}</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {courseMetrics.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <BarChart3 className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">暂无课程数据</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {courseMetrics.map((m) => (
                <CourseMetricCard key={m.id} metric={m} />
              ))}
            </div>
          )}

          <p className="text-xs text-subtle-foreground">
            数据范围：过去 30 天内的作业（已截止）/ 考试（已截止）。当前活跃作业/考试不计分。
          </p>
        </div>
      </main>
    </>
  );
}

function CourseMetricCard({ metric }: { metric: CourseMetric }) {
  const completion =
    metric.assignmentCompletion.expected > 0
      ? Math.round(
          (metric.assignmentCompletion.submitted /
            metric.assignmentCompletion.expected) *
            100,
        )
      : null;
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              <Link
                href={`/t/courses/${metric.id}`}
                className="truncate text-base font-semibold text-foreground transition-colors hover:text-primary"
              >
                {metric.title}
              </Link>
              {metric.hasActiveExam && (
                <Badge variant="primary">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                  有考试进行中
                </Badge>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span><span className="num">{metric.classCount}</span> 个班级</span>
              <span>·</span>
              <span><span className="num">{metric.studentCount}</span> 名学生</span>
              <span>·</span>
              <span>活跃作业 <span className="num">{metric.activeAssignments}</span></span>
              <span>·</span>
              <span>近 30 天截止 <span className="num">{metric.closedAssignments}</span></span>
              <span>·</span>
              <span>近 30 天考试 <span className="num">{metric.closedExams}</span></span>
            </div>
          </div>
          <Link
            href={`/t/courses/${metric.id}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            进入课程
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* 作业均分 */}
          <MetricBox
            label="作业平均分"
            value={
              metric.assignmentAvg == null ? (
                <span className="text-muted-foreground">暂无批改数据</span>
              ) : (
                <>
                  <span className="num text-2xl font-bold tracking-tight">
                    {metric.assignmentAvg.toFixed(1)}
                  </span>
                </>
              )
            }
            icon={FileText}
            tone={
              metric.assignmentAvg == null
                ? "muted"
                : metric.assignmentAvg >= 80
                  ? "success"
                  : metric.assignmentAvg >= 60
                    ? "primary"
                    : "warning"
            }
          />
          {/* 作业完成率 */}
          <MetricBox
            label="作业完成率"
            value={
              completion == null ? (
                <span className="text-muted-foreground">暂无截止作业</span>
              ) : (
                <>
                  <span className="num text-2xl font-bold tracking-tight">{completion}</span>
                  <span className="ml-1 text-sm text-muted-foreground">%</span>
                </>
              )
            }
            icon={ClipboardCheck}
            tone={
              completion == null
                ? "muted"
                : completion >= 90
                  ? "success"
                  : completion >= 70
                    ? "primary"
                    : "warning"
            }
          />
          {/* 考试均分 + 及格率 */}
          <MetricBox
            label="考试均分 / 及格率"
            value={
              metric.examAvg == null ? (
                <span className="text-muted-foreground">暂无考试数据</span>
              ) : (
                <>
                  <span className="num text-2xl font-bold tracking-tight">
                    {metric.examAvg.toFixed(1)}
                  </span>
                  <span className="ml-2 num text-sm text-muted-foreground">
                    及格 {(metric.examPassRate ?? 0) * 100 | 0}%
                  </span>
                </>
              )
            }
            icon={GraduationCap}
            tone={
              metric.examAvg == null
                ? "muted"
                : metric.examAvg >= 75
                  ? "success"
                  : metric.examAvg >= 60
                    ? "primary"
                    : "warning"
            }
          />
        </div>

        {/* 异常提示 */}
        {completion != null && completion < 60 && (
          <div className="mt-4 flex items-center gap-1.5 rounded-lg border border-warning/30 bg-warning-subtle/30 p-2 text-[11px] text-warning">
            <AlertCircle className="h-3 w-3" />
            最近 30 天作业完成率偏低，关注未交卷学生。
          </div>
        )}
        {metric.examPassRate != null && metric.examPassRate < 0.6 && (
          <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-danger/30 bg-danger-subtle/30 p-2 text-[11px] text-danger">
            <AlertCircle className="h-3 w-3" />
            最近 30 天考试及格率低于 60%，建议复盘试卷重难点。
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MetricBox({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  tone: "success" | "primary" | "warning" | "danger" | "muted";
}) {
  const toneCls =
    tone === "success"
      ? "bg-success-subtle text-success"
      : tone === "primary"
        ? "bg-primary-subtle text-primary"
        : tone === "warning"
          ? "bg-warning-subtle text-warning"
          : tone === "danger"
            ? "bg-danger-subtle text-danger"
            : "bg-muted text-muted-foreground";
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className={`flex h-7 w-7 items-center justify-center rounded-md ${toneCls}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <div className="mt-2">{value}</div>
    </div>
  );
}
