import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Topbar } from "@/components/shell/topbar";
import { relativeTime, formatDate } from "@/lib/utils";
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  ClipboardCheck,
  Filter,
} from "lucide-react";
import type { SubmissionStatus } from "@prisma/client";

export const metadata = { title: "我的作业" };

type StatusFilter = "all" | "pending" | "submitted" | "graded";

const STATUS_LABELS: Record<SubmissionStatus, { label: string; tone: "default" | "warning" | "success" | "accent" }> = {
  DRAFT: { label: "草稿", tone: "default" },
  SUBMITTED: { label: "已提交", tone: "warning" },
  GRADED: { label: "已批改", tone: "success" },
  RETURNED: { label: "已退回", tone: "accent" },
};

export default async function StudentAssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  const userId = session!.user.id;
  const sp = await searchParams;
  const now = new Date();

  const status: StatusFilter =
    sp.status === "pending" ||
    sp.status === "submitted" ||
    sp.status === "graded"
      ? sp.status
      : "all";

  // 学生所在班级
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { classId: true },
  });
  if (!me?.classId) {
    redirect("/dashboard");
  }

  // 学生在哪些课程的班级里
  const courseIds = await prisma.courseClass.findMany({
    where: { classId: me.classId },
    select: { courseId: true },
  });
  const myCourseIds = courseIds.map((c) => c.courseId);
  if (myCourseIds.length === 0) {
    return (
      <>
        <Topbar crumbs={[{ label: "我的作业" }]} />
        <main className="flex-1 p-8">
          <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">我的作业</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                下方为您布置的作业与提交记录。
              </p>
            </div>
            <Card>
              <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    您所在的班级还没有加入任何课程
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    请联系管理员把班级分配到课程后再来查看作业。
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </>
    );
  }

  // 拉所有该课程下发布的作业
  const assignments = await prisma.assignment.findMany({
    where: {
      courseId: { in: myCourseIds },
      publishedAt: { not: null },
    },
    orderBy: { dueAt: "asc" },
    include: {
      course: { select: { id: true, title: true } },
      _count: { select: { problems: true } },
      submissions: {
        where: { studentId: userId },
        select: {
          id: true,
          status: true,
          autoScore: true,
          manualScore: true,
          finalScore: true,
          submittedAt: true,
          gradedAt: true,
        },
        take: 1,
      },
    },
    take: 100,
  });

  const mySubByAssignment = new Map<string | null, typeof assignments[number]["submissions"][number] | null>();
  // re-key: take=1 still returns array
  for (const a of assignments) {
    const sub = a.submissions[0] ?? null;
    mySubByAssignment.set(a.id, sub);
  }

  // 全局 stats
  const [pendingCount, submittedCount, gradedCount, overdueCount] = await Promise.all([
    prisma.assignment.count({
      where: {
        courseId: { in: myCourseIds },
        publishedAt: { not: null },
        dueAt: { gte: now },
        submissions: { none: { studentId: userId } },
      },
    }),
    prisma.assignmentSubmission.count({
      where: {
        studentId: userId,
        status: "SUBMITTED",
        assignment: { courseId: { in: myCourseIds }, publishedAt: { not: null } },
      },
    }),
    prisma.assignmentSubmission.count({
      where: {
        studentId: userId,
        status: "GRADED",
        assignment: { courseId: { in: myCourseIds }, publishedAt: { not: null } },
      },
    }),
    prisma.assignment.count({
      where: {
        courseId: { in: myCourseIds },
        publishedAt: { not: null },
        dueAt: { lt: now },
        submissions: { none: { studentId: userId } },
      },
    }),
  ]);

  const stats = [
    { icon: Clock, label: "待完成", num: pendingCount },
    { icon: ClipboardCheck, label: "已提交", num: submittedCount },
    { icon: CheckCircle2, label: "已批改", num: gradedCount, success: true },
    { icon: AlertCircle, label: "已逾期未交", num: overdueCount, warning: true },
  ];

  // 过滤
  const filtered = assignments.filter((a) => {
    const sub = mySubByAssignment.get(a.id) ?? null;
    const isOverdue = a.dueAt < now;
    if (status === "all") return true;
    if (status === "submitted")
      return sub?.status === "SUBMITTED" || sub?.status === "RETURNED";
    if (status === "graded") return sub?.status === "GRADED";
    if (status === "pending")
      return !sub && !isOverdue; // 仅未提交的进行中作业
    return true;
  });

  const statusTabs: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "pending", label: "待完成" },
    { key: "submitted", label: "已提交" },
    { key: "graded", label: "已批改" },
  ];

  return (
    <>
      <Topbar crumbs={[{ label: "我的作业" }]} />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">我的作业</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              下方为您布置的作业与提交记录，按截止时间排序。
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

          {/* 过滤条 */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">状态：</span>
              {statusTabs.map((t) => {
                const active = status === t.key;
                const href = `/assignments${t.key !== "all" ? `?status=${t.key}` : ""}`;
                return (
                  <Link
                    key={t.key}
                    href={href}
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
                      ? "暂未收到任何作业"
                      : `没有${statusTabs.find((t) => t.key === status)?.label}作业`}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {status === "all"
                      ? "教师发布后会出现在这里"
                      : "切换其他状态查看"}
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
                      <th className="px-6 py-3">标题</th>
                      <th className="px-6 py-3">课程</th>
                      <th className="px-6 py-3">截止</th>
                      <th className="px-6 py-3">题目</th>
                      <th className="px-6 py-3">状态</th>
                      <th className="px-6 py-3 text-right">得分</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.map((a) => {
                      const sub = mySubByAssignment.get(a.id) ?? null;
                      const isOverdue = a.dueAt < now;
                      return (
                        <tr
                          key={a.id}
                          className="group transition-colors hover:bg-muted/30"
                        >
                          <td className="px-6 py-3.5">
                            <Link
                              href={`/assignments/${a.id}`}
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
                          <td className="px-6 py-3.5 num text-muted-foreground">
                            {a._count.problems}
                          </td>
                          <td className="px-6 py-3.5">
                            {sub ? (
                              <Badge variant={STATUS_LABELS[sub.status].tone}>
                                {STATUS_LABELS[sub.status].label}
                              </Badge>
                            ) : isOverdue ? (
                              <Badge variant="default">逾期未交</Badge>
                            ) : (
                              <Badge variant="success">进行中</Badge>
                            )}
                          </td>
                          <td className="px-6 py-3.5 text-right text-sm num">
                            {sub?.finalScore != null ? (
                              <span
                                className={
                                  sub.finalScore >= a.totalScore * 0.8
                                    ? "text-success"
                                    : sub.finalScore >= a.totalScore * 0.6
                                      ? "text-foreground"
                                      : "text-danger"
                                }
                              >
                                {sub.finalScore} / {a.totalScore}
                              </span>
                            ) : sub?.autoScore != null ? (
                              <span className="text-muted-foreground">
                                {sub.autoScore} / {a.totalScore}
                                <span className="ml-1 text-[11px] text-subtle-foreground">
                                  (待批改)
                                </span>
                              </span>
                            ) : (
                              <span className="text-subtle-foreground">—</span>
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
