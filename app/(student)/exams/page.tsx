import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Topbar } from "@/components/shell/topbar";
import { formatDate, relativeTime } from "@/lib/utils";
import {
  Library,
  Clock,
  ChevronRight,
  Filter,
  CheckCircle2,
  GraduationCap,
  AlertCircle,
} from "lucide-react";
import type { AttemptStatus } from "@prisma/client";

export const metadata = { title: "我的考试" };

type StatusFilter = "all" | "upcoming" | "available" | "in_progress" | "submitted";

export default async function StudentExamsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  const userId = session!.user.id;
  const sp = await searchParams;
  const now = new Date();
  const status: StatusFilter =
    sp.status === "upcoming" ||
    sp.status === "available" ||
    sp.status === "in_progress" ||
    sp.status === "submitted"
      ? sp.status
      : "all";

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { classId: true },
  });
  if (!me?.classId) redirect("/dashboard");

  // 我所在班级的课程列表
  const courseIds = await prisma.courseClass.findMany({
    where: { classId: me.classId },
    select: { courseId: true },
  });
  const myCourseIds = courseIds.map((c) => c.courseId);

  // 所有课程下的考试（含历史）+ 我的 attempts
  const allExams = await prisma.exam.findMany({
    where: {
      courseId: { in: myCourseIds },
      status: { in: ["PUBLISHED", "CLOSED"] },
    },
    include: {
      course: { select: { id: true, title: true } },
      _count: { select: { questions: true } },
    },
    orderBy: [{ openAt: "asc" }],
    take: 200,
  });

  const myAttempts = await prisma.examAttempt.findMany({
    where: {
      studentId: userId,
      examId: { in: allExams.map((e) => e.id) },
    },
    select: {
      id: true,
      examId: true,
      status: true,
      autoScore: true,
      finalScore: true,
      startedAt: true,
      submittedAt: true,
      deadlineAt: true,
    },
  });
  const attemptByExam = new Map(myAttempts.map((a) => [a.examId, a]));

  // 分类
  const upcoming = allExams.filter((e) => e.status === "PUBLISHED" && e.openAt > now && !attemptByExam.has(e.id));
  const available = allExams.filter(
    (e) =>
      e.status === "PUBLISHED" &&
      e.openAt <= now &&
      e.closeAt >= now &&
      !attemptByExam.has(e.id),
  );
  const inProgress = allExams.filter((e) => {
    const a = attemptByExam.get(e.id);
    return a?.status === "IN_PROGRESS";
  });
  const submitted = allExams.filter((e) => {
    const a = attemptByExam.get(e.id);
    return a && (a.status === "SUBMITTED" || a.status === "GRADING" || a.status === "GRADED");
  });
  const missed = allExams.filter(
    (e) =>
      (e.status === "CLOSED" || (e.status === "PUBLISHED" && e.closeAt < now)) &&
      !attemptByExam.has(e.id),
  );

  // stats
  const stats = [
    { icon: Clock, label: "即将开考", num: upcoming.length, tone: "muted" as const },
    { icon: GraduationCap, label: "现在可参加", num: available.length, tone: "primary" as const },
    { icon: AlertCircle, label: "进行中", num: inProgress.length, tone: "warning" as const },
    { icon: CheckCircle2, label: "已交卷", num: submitted.length, tone: "success" as const },
  ];

  // 过滤
  let filtered: typeof allExams = allExams;
  if (status === "upcoming") filtered = upcoming;
  else if (status === "available") filtered = available;
  else if (status === "in_progress") filtered = inProgress;
  else if (status === "submitted") filtered = submitted;

  const statusTabs: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "upcoming", label: "即将开考" },
    { key: "available", label: "可参加" },
    { key: "in_progress", label: "进行中" },
    { key: "submitted", label: "已交卷" },
  ];

  return (
    <>
      <Topbar crumbs={[{ label: "我的考试" }]} />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">我的考试</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              您所在班级的已发布考试。按开考时间排序。
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
                            : s.tone === "warning"
                              ? "bg-warning-subtle text-warning"
                              : s.tone === "success"
                                ? "bg-success-subtle text-success"
                                : "bg-muted text-muted-foreground"
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
                const href = `/exams${t.key !== "all" ? `?status=${t.key}` : ""}`;
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

          {myCourseIds.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Library className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  您所在的班级尚未加入任何课程
                </p>
              </CardContent>
            </Card>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Library className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  {status === "all" ? "本课程暂无考试" : `暂无${statusTabs.find((t) => t.key === status)?.label}的考试`}
                </p>
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
                      <th className="px-6 py-3">开考</th>
                      <th className="px-6 py-3">截止</th>
                      <th className="px-6 py-3 text-right">时长</th>
                      <th className="px-6 py-3 text-right">题目</th>
                      <th className="px-6 py-3 text-right">总分</th>
                      <th className="px-6 py-3">状态</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.map((e) => {
                      const att = attemptByExam.get(e.id);
                      const isUpcoming = e.status === "PUBLISHED" && e.openAt > now && !att;
                      const isAvailable =
                        e.status === "PUBLISHED" && e.openAt <= now && e.closeAt >= now && !att;
                      const isMissed =
                        !att && (e.status === "CLOSED" || (e.status === "PUBLISHED" && e.closeAt < now));
                      return (
                        <tr
                          key={e.id}
                          className="group transition-colors hover:bg-muted/30"
                        >
                          <td className="px-6 py-3.5">
                            <Link
                              href={`/exams/${e.id}`}
                              className="font-medium text-foreground hover:text-primary"
                            >
                              {e.title}
                            </Link>
                          </td>
                          <td className="px-6 py-3.5">
                            <Badge variant="primary" className="font-normal">
                              {e.course.title}
                            </Badge>
                          </td>
                          <td className="px-6 py-3.5 text-xs text-muted-foreground">
                            <div className="num">{formatDate(e.openAt)}</div>
                          </td>
                          <td className="px-6 py-3.5 text-xs text-muted-foreground num">
                            {formatDate(e.closeAt)}
                          </td>
                          <td className="px-6 py-3.5 num text-right text-muted-foreground">
                            {e.durationMin}m
                          </td>
                          <td className="px-6 py-3.5 num text-right text-muted-foreground">
                            {e._count.questions}
                          </td>
                          <td className="px-6 py-3.5 num text-right text-muted-foreground">
                            {e.totalScore}
                          </td>
                          <td className="px-6 py-3.5">
                            {att ? (
                              <AttemptBadge status={att.status} />
                            ) : isAvailable ? (
                              <Badge variant="success">可参加</Badge>
                            ) : isUpcoming ? (
                              <Badge variant="default">未开考</Badge>
                            ) : isMissed ? (
                              <Badge variant="default">已逾期</Badge>
                            ) : (
                              <Badge variant="default">—</Badge>
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

          {missed.length > 0 && status === "all" && (
            <div className="rounded-xl border border-warning/40 bg-warning-subtle/40 p-3 text-xs text-warning">
              <AlertCircle className="mr-1 inline h-3 w-3" />
              您有 {missed.length} 场考试已逾期未参加
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function AttemptBadge({ status }: { status: AttemptStatus }) {
  switch (status) {
    case "IN_PROGRESS":
      return <Badge variant="warning">进行中</Badge>;
    case "SUBMITTED":
      return <Badge variant="primary">已交卷</Badge>;
    case "GRADING":
      return <Badge variant="warning">批改中</Badge>;
    case "GRADED":
      return <Badge variant="success">已批改</Badge>;
  }
}
