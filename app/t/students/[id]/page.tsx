import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Topbar } from "@/components/shell/topbar";
import { formatDate } from "@/lib/utils";
import {
  ChevronLeft,
  Users,
  GraduationCap,
  ClipboardCheck,
  BarChart3,
  FileText,
  Mail,
  AtSign,
  Trophy,
  ArrowRight,
} from "lucide-react";
import type { CourseCategory } from "@prisma/client";

const CATEGORY_LABELS: Record<CourseCategory, string> = {
  DATA: "数据",
  ALGORITHM: "算法",
  AI: "人工智能",
  NETWORK: "计算机网络",
  INTERDISCIPLINARY: "多学科交叉",
};

const SUBMISSION_STATUS: Record<string, { label: string; tone: "default" | "primary" | "success" | "warning" }> = {
  DRAFT: { label: "草稿", tone: "default" },
  SUBMITTED: { label: "已提交", tone: "primary" },
  GRADED: { label: "已批改", tone: "success" },
  RETURNED: { label: "已退回", tone: "warning" },
};

const EXAM_STATUS: Record<string, { label: string; tone: "default" | "primary" | "warning" | "success" }> = {
  ENROLLED: { label: "未开始", tone: "default" },
  IN_PROGRESS: { label: "进行中", tone: "primary" },
  SUBMITTED: { label: "已交卷", tone: "warning" },
  GRADING: { label: "批改中", tone: "warning" },
  GRADED: { label: "已批改", tone: "success" },
  EXPIRED: { label: "已过期", tone: "default" },
};

export const metadata = { title: "学生详情" };

export default async function TeacherStudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: studentId } = await params;
  const session = await auth();
  const teacherId = session!.user.id;

  const [student, sharedCourses] = await Promise.all([
    prisma.user.findUnique({
      where: { id: studentId, role: "STUDENT", status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        studentNo: true,
        email: true,
        mustChangePassword: true,
        class: {
          select: {
            id: true,
            name: true,
            grade: { select: { name: true, joinYear: true } },
          },
        },
      },
    }),
    // 共享课程：教师任课 ∩ 学生班级归属
    prisma.course.findMany({
      where: {
        isArchived: false,
        teachers: { some: { teacherId } },
        classes: { some: { class: { students: { some: { id: studentId } } } } },
      },
      select: { id: true, title: true, category: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!student) notFound();
  if (sharedCourses.length === 0) redirect("/t/courses?error=forbidden");

  const sharedCourseIds = sharedCourses.map((c) => c.id);
  const now = new Date();

  // 第二轮：作业 + 该学生的提交 + 考试 + 该学生尝试
  const [assignmentsWithSubs, examsWithAttempts, closedAssignmentCount] =
    await Promise.all([
      prisma.assignment.findMany({
        where: {
          courseId: { in: sharedCourseIds },
          publishedAt: { not: null },
        },
        include: {
          course: { select: { id: true, title: true, category: true } },
          submissions: {
            where: { studentId },
            orderBy: { submittedAt: "desc" },
            take: 1,
            select: {
              id: true,
              status: true,
              finalScore: true,
              submittedAt: true,
              gradedAt: true,
            },
          },
        },
        orderBy: [{ dueAt: "desc" }],
      }),
      prisma.exam.findMany({
        where: { courseId: { in: sharedCourseIds }, status: "PUBLISHED" },
        include: {
          course: { select: { id: true, title: true, category: true } },
          attempts: {
            where: { studentId },
            orderBy: { startedAt: "desc" },
            take: 1,
            select: {
              id: true,
              status: true,
              finalScore: true,
              submittedAt: true,
              startedAt: true,
            },
          },
        },
        orderBy: { closeAt: "desc" },
      }),
      prisma.assignment.count({
        where: {
          courseId: { in: sharedCourseIds },
          publishedAt: { not: null },
          dueAt: { lt: now },
        },
      }),
    ]);

  // 顶部 4 张统计卡
  let avgSum = 0;
  let avgN = 0;
  let submittedTotal = 0;
  let examSum = 0;
  let examN = 0;
  for (const a of assignmentsWithSubs) {
    const sub = a.submissions[0];
    if (sub && sub.finalScore != null && a.totalScore > 0) {
      avgSum += sub.finalScore / a.totalScore;
      avgN++;
    }
    if (sub && sub.status !== "DRAFT") submittedTotal++;
  }
  const overallAvgPct = avgN > 0 ? Math.round((avgSum / avgN) * 100) : null;
  const completionPct =
    closedAssignmentCount > 0
      ? Math.min(100, Math.round((submittedTotal / closedAssignmentCount) * 100))
      : null;
  for (const e of examsWithAttempts) {
    const att = e.attempts[0];
    if (att && att.status === "GRADED" && att.finalScore != null && e.totalScore > 0) {
      examSum += att.finalScore / e.totalScore;
      examN++;
    }
  }
  const examAvgPct = examN > 0 ? Math.round((examSum / examN) * 100) : null;

  // 按课程分组
  const assignmentsByCourse = new Map<string, typeof assignmentsWithSubs>();
  for (const a of assignmentsWithSubs) {
    const arr = assignmentsByCourse.get(a.courseId) ?? [];
    arr.push(a);
    assignmentsByCourse.set(a.courseId, arr);
  }
  const examsByCourse = new Map<string, typeof examsWithAttempts>();
  for (const e of examsWithAttempts) {
    const arr = examsByCourse.get(e.courseId) ?? [];
    arr.push(e);
    examsByCourse.set(e.courseId, arr);
  }

  const firstCourse = sharedCourses[0];

  return (
    <>
      <Topbar
        crumbs={[
          { label: "我的课程", href: "/t/courses" },
          ...(firstCourse
            ? [
                {
                  label: firstCourse.title,
                  href: `/t/courses/${firstCourse.id}/students`,
                },
              ]
            : []),
          { label: student.name },
        ]}
      />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          {/* 返回链接 */}
          <Link
            href={firstCourse ? `/t/courses/${firstCourse.id}/students` : "/t/courses"}
            className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-3 w-3" />
            返回选班学生
          </Link>

          {/* 学生卡片 */}
          <Card>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-lg font-semibold text-white">
                {student.name.slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold tracking-tight">{student.name}</h1>
                  <Badge variant="primary" className="font-mono">
                    <AtSign className="mr-0.5 inline h-3 w-3" />
                    {student.studentNo}
                  </Badge>
                  {student.mustChangePassword ? (
                    <Badge variant="warning">未改密</Badge>
                  ) : (
                    <Badge variant="success">账号正常</Badge>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {student.class && (
                    <span className="inline-flex items-center gap-1">
                      <GraduationCap className="h-3 w-3" />
                      {student.class.grade.name} · {student.class.name}
                      <span className="text-subtle-foreground num">
                        · {student.class.grade.joinYear} 级
                      </span>
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {student.email}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 顶部 4 张统计卡 */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={<Users className="h-4 w-4" />}
              label="共享课程"
              value={sharedCourses.length}
              hint="您与该学生的共同课程"
              tone="primary"
            />
            <StatCard
              icon={<ClipboardCheck className="h-4 w-4" />}
              label="作业完成率"
              value={completionPct == null ? "—" : `${completionPct}%`}
              hint={
                closedAssignmentCount === 0
                  ? "暂无已截止作业"
                  : `已交 ${submittedTotal} / ${closedAssignmentCount}`
              }
              tone={
                completionPct == null
                  ? "muted"
                  : completionPct >= 90
                    ? "success"
                    : completionPct >= 70
                      ? "primary"
                      : "warning"
              }
            />
            <StatCard
              icon={<Trophy className="h-4 w-4" />}
              label="作业均分"
              value={overallAvgPct == null ? "—" : `${overallAvgPct}%`}
              hint={
                avgN === 0
                  ? "暂无已批改样本"
                  : `基于 ${avgN} 次已批改作业`
              }
              tone={
                overallAvgPct == null
                  ? "muted"
                  : overallAvgPct >= 85
                    ? "success"
                    : overallAvgPct >= 60
                      ? "primary"
                      : "warning"
              }
            />
            <StatCard
              icon={<BarChart3 className="h-4 w-4" />}
              label="考试均分"
              value={examAvgPct == null ? "—" : `${examAvgPct}%`}
              hint={
                examN === 0
                  ? "暂无已批改考试"
                  : `基于 ${examN} 场已批改考试`
              }
              tone={
                examAvgPct == null
                  ? "muted"
                  : examAvgPct >= 85
                    ? "success"
                    : examAvgPct >= 60
                      ? "primary"
                      : "warning"
              }
            />
          </div>

          {/* 作业总览 */}
          <Card>
            <CardContent className="p-6">
              <div className="mb-4 flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <h2 className="text-base font-semibold">作业总览</h2>
                <span className="text-xs text-muted-foreground num">
                  · {assignmentsWithSubs.length} 项
                </span>
              </div>
              {assignmentsWithSubs.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
                  该学生与您暂无共享课程的已发布作业。
                </p>
              ) : (
                <div className="space-y-5">
                  {sharedCourses.map((c) => {
                    const items = assignmentsByCourse.get(c.id) ?? [];
                    if (items.length === 0) return null;
                    return (
                      <section key={c.id}>
                        <div className="mb-2 flex items-center gap-2">
                          <Badge variant="primary">
                            {CATEGORY_LABELS[c.category]}
                          </Badge>
                          <span className="text-sm font-medium text-foreground">
                            {c.title}
                          </span>
                          <span className="text-xs text-muted-foreground num">
                            · {items.length} 项
                          </span>
                        </div>
                        <div className="overflow-hidden rounded-xl border border-border">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border bg-muted/30 text-left text-xs font-medium text-muted-foreground">
                                <th className="px-4 py-2.5">作业标题</th>
                                <th className="px-4 py-2.5">截止</th>
                                <th className="px-4 py-2.5">状态</th>
                                <th className="px-4 py-2.5">分数</th>
                                <th className="px-4 py-2.5 text-right">操作</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {items.map((a) => {
                                const sub = a.submissions[0];
                                const overdue =
                                  a.dueAt.getTime() < now.getTime() &&
                                  (!sub || sub.status === "DRAFT");
                                const status = sub
                                  ? SUBMISSION_STATUS[sub.status] ?? {
                                      label: sub.status,
                                      tone: "default" as const,
                                    }
                                  : { label: "未提交", tone: "default" as const };
                                const pct =
                                  sub && sub.finalScore != null && a.totalScore > 0
                                    ? Math.round((sub.finalScore / a.totalScore) * 100)
                                    : null;
                                const scoreTone =
                                  pct == null
                                    ? null
                                    : pct >= 85
                                      ? "success"
                                      : pct >= 60
                                        ? "primary"
                                        : "warning";
                                return (
                                  <tr
                                    key={a.id}
                                    className="transition-colors hover:bg-muted/20"
                                  >
                                    <td className="px-4 py-2.5">
                                      <div className="font-medium text-foreground">
                                        {a.title}
                                      </div>
                                    </td>
                                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                                      <div>{formatDate(a.dueAt)}</div>
                                      {overdue && (
                                        <div className="text-[11px] text-danger">
                                          已逾期
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <Badge variant={status.tone}>{status.label}</Badge>
                                    </td>
                                    <td className="px-4 py-2.5 num">
                                      {sub && sub.finalScore != null ? (
                                        <span
                                          className={
                                            scoreTone === "success"
                                              ? "text-success font-medium"
                                              : scoreTone === "primary"
                                                ? "text-primary font-medium"
                                                : "text-warning font-medium"
                                          }
                                        >
                                          {sub.finalScore}
                                          <span className="text-subtle-foreground">
                                            {" "}
                                            / {a.totalScore}
                                          </span>
                                        </span>
                                      ) : (
                                        <span className="text-subtle-foreground">—</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-2.5 text-right">
                                      <Link
                                        href={`/t/assignments/${a.id}/grade`}
                                        className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
                                      >
                                        批改
                                        <ArrowRight className="h-3 w-3" />
                                      </Link>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 考试总览 */}
          <Card>
            <CardContent className="p-6">
              <div className="mb-4 flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-primary" />
                <h2 className="text-base font-semibold">考试总览</h2>
                <span className="text-xs text-muted-foreground num">
                  · {examsWithAttempts.length} 场
                </span>
              </div>
              {examsWithAttempts.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
                  该学生与您暂无共享课程的考试。
                </p>
              ) : (
                <div className="space-y-5">
                  {sharedCourses.map((c) => {
                    const items = examsByCourse.get(c.id) ?? [];
                    if (items.length === 0) return null;
                    return (
                      <section key={c.id}>
                        <div className="mb-2 flex items-center gap-2">
                          <Badge variant="primary">
                            {CATEGORY_LABELS[c.category]}
                          </Badge>
                          <span className="text-sm font-medium text-foreground">
                            {c.title}
                          </span>
                          <span className="text-xs text-muted-foreground num">
                            · {items.length} 场
                          </span>
                        </div>
                        <div className="overflow-hidden rounded-xl border border-border">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border bg-muted/30 text-left text-xs font-medium text-muted-foreground">
                                <th className="px-4 py-2.5">考试标题</th>
                                <th className="px-4 py-2.5">开考</th>
                                <th className="px-4 py-2.5">时长</th>
                                <th className="px-4 py-2.5">状态</th>
                                <th className="px-4 py-2.5">分数</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {items.map((e) => {
                                const att = e.attempts[0];
                                const status = att
                                  ? EXAM_STATUS[att.status] ?? {
                                      label: att.status,
                                      tone: "default" as const,
                                    }
                                  : { label: "未参加", tone: "default" as const };
                                const pct =
                                  att && att.finalScore != null && e.totalScore > 0
                                    ? Math.round((att.finalScore / e.totalScore) * 100)
                                    : null;
                                const scoreTone =
                                  pct == null
                                    ? null
                                    : pct >= 85
                                      ? "success"
                                      : pct >= 60
                                        ? "primary"
                                        : "warning";
                                return (
                                  <tr
                                    key={e.id}
                                    className="transition-colors hover:bg-muted/20"
                                  >
                                    <td className="px-4 py-2.5">
                                      <Link
                                        href={`/t/exams/${e.id}/grade`}
                                        className="font-medium text-foreground hover:text-primary"
                                      >
                                        {e.title}
                                      </Link>
                                    </td>
                                    <td className="px-4 py-2.5 text-xs text-muted-foreground num">
                                      {formatDate(e.openAt)}
                                    </td>
                                    <td className="px-4 py-2.5 text-xs text-muted-foreground num">
                                      {e.durationMin}m
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <Badge variant={status.tone}>{status.label}</Badge>
                                    </td>
                                    <td className="px-4 py-2.5 num">
                                      {att && att.finalScore != null ? (
                                        <span
                                          className={
                                            scoreTone === "success"
                                              ? "text-success font-medium"
                                              : scoreTone === "primary"
                                                ? "text-primary font-medium"
                                                : "text-warning font-medium"
                                          }
                                        >
                                          {att.finalScore}
                                          <span className="text-subtle-foreground">
                                            {" "}
                                            / {e.totalScore}
                                          </span>
                                        </span>
                                      ) : (
                                        <span className="text-subtle-foreground">—</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  hint: string;
  tone: "primary" | "success" | "warning" | "muted";
}) {
  const toneClass = {
    primary: "bg-primary-subtle text-primary",
    success: "bg-success-subtle text-success",
    warning: "bg-warning-subtle text-warning",
    muted: "bg-muted text-muted-foreground",
  }[tone];
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <span className="text-sm text-muted-foreground">{label}</span>
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${toneClass}`}>
            {icon}
          </div>
        </div>
        <div className="mt-3 text-3xl font-bold tracking-tight num">{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
      </CardContent>
    </Card>
  );
}