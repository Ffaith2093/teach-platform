import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Topbar } from "@/components/shell/topbar";
import { relativeTime, formatDate } from "@/lib/utils";
import {
  ClipboardCheck,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Filter,
  FileText,
} from "lucide-react";
import type { SubmissionStatus } from "@prisma/client";

export const metadata = { title: "批改工作台" };

type StatusFilter = "all" | "submitted" | "graded" | "returned";

export default async function TeacherGradingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  const userId = session!.user.id;
  const sp = await searchParams;
  const now = new Date();

  const status: StatusFilter =
    sp.status === "submitted" || sp.status === "graded" || sp.status === "returned"
      ? sp.status
      : "all";

  if (session!.user.role !== "TEACHER") {
    redirect("/login?error=forbidden");
  }

  // 我作为主讲/助教的所有课程
  const memberships = await prisma.courseTeacher.findMany({
    where: { teacherId: userId, role: { in: ["OWNER", "ASSISTANT"] } },
    select: { courseId: true, course: { select: { title: true } } },
  });
  const myCourseIds = memberships.map((m) => m.courseId);
  if (myCourseIds.length === 0) {
    return (
      <>
        <Topbar crumbs={[{ label: "批改工作台" }]} />
        <main className="flex-1 p-8">
          <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
            <h1 className="text-2xl font-semibold tracking-tight">批改工作台</h1>
            <Card>
              <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <ClipboardCheck className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  您不在任何课程的教师团队中
                </p>
                <p className="text-xs text-muted-foreground">
                  请联系管理员把您加入课程后再来批改作业。
                </p>
              </CardContent>
            </Card>
          </div>
        </main>
      </>
    );
  }

  // Stats
  const [pending, graded, returned, avgGradeHours] = await Promise.all([
    prisma.assignmentSubmission.count({
      where: {
        status: "SUBMITTED",
        assignment: { courseId: { in: myCourseIds }, publishedAt: { not: null } },
      },
    }),
    prisma.assignmentSubmission.count({
      where: {
        status: "GRADED",
        assignment: { courseId: { in: myCourseIds }, publishedAt: { not: null } },
      },
    }),
    prisma.assignmentSubmission.count({
      where: {
        status: "RETURNED",
        assignment: { courseId: { in: myCourseIds }, publishedAt: { not: null } },
      },
    }),
    // 平均批改耗时：gradedAt - submittedAt，按小时
    prisma.assignmentSubmission
      .findMany({
        where: {
          status: "GRADED",
          assignment: { courseId: { in: myCourseIds } },
          submittedAt: { not: null },
          gradedAt: { not: null },
        },
        select: { submittedAt: true, gradedAt: true },
        take: 200,
      })
      .then((rows) => {
        if (rows.length === 0) return null;
        const totalMs = rows.reduce((sum, r) => {
          const s = r.submittedAt!.getTime();
          const g = r.gradedAt!.getTime();
          return sum + Math.max(0, g - s);
        }, 0);
        const avg = totalMs / rows.length;
        return Math.max(1, Math.round(avg / 3600000));
      }),
  ]);

  const stats = [
    { icon: Clock, label: "待批改", num: pending, warning: true },
    { icon: CheckCircle2, label: "已批改", num: graded, success: true },
    { icon: XCircle, label: "已退回", num: returned },
    {
      icon: ClipboardCheck,
      label: "平均处理",
      num: avgGradeHours == null ? "—" : `${avgGradeHours}h`,
      muted: true,
    },
  ];

  // 拉所有相关作业（含统计）
  const assignments = await prisma.assignment.findMany({
    where: {
      courseId: { in: myCourseIds },
      publishedAt: { not: null },
    },
    orderBy: { dueAt: "desc" },
    include: {
      course: { select: { title: true } },
      _count: { select: { submissions: true } },
      submissions: {
        select: { id: true, status: true, gradedAt: true, submittedAt: true, finalScore: true },
      },
    },
    take: 200,
  });

  // 计算每份作业的待批改/已批改/已退回数
  type Row = (typeof assignments)[number] & {
    pendingCount: number;
    gradedCount: number;
    returnedCount: number;
    avgScore: number | null;
    lastSubmittedAt: Date | null;
  };

  const enriched: Row[] = assignments.map((a) => {
    let pendingCount = 0;
    let gradedCount = 0;
    let returnedCount = 0;
    const finals: number[] = [];
    let lastSubmitted: Date | null = null;
    for (const s of a.submissions) {
      if (s.status === "SUBMITTED") pendingCount++;
      else if (s.status === "GRADED") {
        gradedCount++;
        if (s.finalScore != null) finals.push(s.finalScore);
      } else if (s.status === "RETURNED") {
        returnedCount++;
      }
      if (s.submittedAt && (!lastSubmitted || s.submittedAt > lastSubmitted)) {
        lastSubmitted = s.submittedAt;
      }
    }
    return {
      ...a,
      pendingCount,
      gradedCount,
      returnedCount,
      avgScore:
        finals.length > 0 ? Math.round(finals.reduce((s, n) => s + n, 0) / finals.length) : null,
      lastSubmittedAt: lastSubmitted,
    };
  });

  // 过滤
  const filtered = enriched.filter((a) => {
    if (status === "all") {
      // 显示"有任何批改活动"的作业
      return a.pendingCount + a.gradedCount + a.returnedCount > 0;
    }
    if (status === "submitted") return a.pendingCount > 0;
    if (status === "graded") return a.gradedCount > 0;
    if (status === "returned") return a.returnedCount > 0;
    return true;
  });

  const statusTabs: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "submitted", label: "待批改" },
    { key: "graded", label: "已批改" },
    { key: "returned", label: "已退回" },
  ];

  return (
    <>
      <Topbar crumbs={[{ label: "批改工作台" }]} />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">批改工作台</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              集中查看您主讲课程的作业提交情况，快速进入批改详情。
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
                          s.warning
                            ? "bg-warning-subtle text-warning"
                            : s.success
                              ? "bg-success-subtle text-success"
                              : s.muted
                                ? "bg-muted text-muted-foreground"
                                : "bg-primary-subtle text-primary"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="mt-3 text-3xl font-bold tracking-tight num">{s.num}</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* 过滤 */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">状态：</span>
              {statusTabs.map((t) => {
                const active = status === t.key;
                return (
                  <Link
                    key={t.key}
                    href={`/t/grading${t.key !== "all" ? `?status=${t.key}` : ""}`}
                    className={`rounded-md px-2 py-1 text-xs ${
                      active
                        ? "bg-primary-subtle font-medium text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {t.label}
                  </Link>
                );
              })}
            </div>
          </div>

          {filtered.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {status === "all"
                      ? "还没有需要批改的提交"
                      : `暂无${statusTabs.find((t) => t.key === status)?.label}的作业`}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    学生提交后会出现在这里。
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                      <th className="px-6 py-3">作业</th>
                      <th className="px-6 py-3">课程</th>
                      <th className="px-6 py-3">截止</th>
                      <th className="px-6 py-3 text-right">待批改</th>
                      <th className="px-6 py-3 text-right">已批改</th>
                      <th className="px-6 py-3 text-right">均分</th>
                      <th className="px-6 py-3">最近提交</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.map((a) => {
                      const isOverdue = a.dueAt < now;
                      return (
                        <tr
                          key={a.id}
                          className="group transition-colors hover:bg-muted/30"
                        >
                          <td className="px-6 py-3.5">
                            <Link
                              href={`/t/assignments/${a.id}/grade`}
                              className="font-medium text-foreground hover:text-primary"
                            >
                              {a.title}
                            </Link>
                          </td>
                          <td className="px-6 py-3.5">
                            <Badge variant="primary" className="font-normal">
                              {a.course.title}
                            </Badge>
                          </td>
                          <td className="px-6 py-3.5 text-xs text-muted-foreground">
                            <div className="num">{formatDate(a.dueAt)}</div>
                            <div className="text-[11px] text-subtle-foreground">
                              {isOverdue ? `${relativeTime(a.dueAt)}已截止` : `${relativeTime(a.dueAt)}截止`}
                            </div>
                          </td>
                          <td className="px-6 py-3.5 text-right text-sm num">
                            {a.pendingCount > 0 ? (
                              <Badge variant="warning" className="font-normal">
                                {a.pendingCount}
                              </Badge>
                            ) : (
                              <span className="text-subtle-foreground">0</span>
                            )}
                          </td>
                          <td className="px-6 py-3.5 text-right num text-muted-foreground">
                            {a.gradedCount}
                          </td>
                          <td className="px-6 py-3.5 text-right num">
                            {a.avgScore != null ? (
                              <span
                                className={
                                  a.avgScore >= a.totalScore * 0.8
                                    ? "text-success"
                                    : a.avgScore >= a.totalScore * 0.6
                                      ? "text-foreground"
                                      : "text-danger"
                                }
                              >
                                {a.avgScore}
                              </span>
                            ) : (
                              <span className="text-subtle-foreground">—</span>
                            )}
                          </td>
                          <td className="px-6 py-3.5 text-xs text-muted-foreground num">
                            {a.lastSubmittedAt ? relativeTime(a.lastSubmittedAt) : "—"}
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
