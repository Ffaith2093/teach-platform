import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Topbar } from "@/components/shell/topbar";
import { ArrowRight, Clock, FileText, GraduationCap, Bell, Trophy } from "lucide-react";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "学生工作台" };

type TodoRow =
  | {
      kind: "assignment";
      id: string;
      title: string;
      courseName: string;
      dueAt: Date;
      submitted: boolean;
    }
  | {
      kind: "exam";
      id: string;
      title: string;
      courseName: string;
      deadlineAt: Date;
      attemptId: string;
    };

function dueLabel(due: Date) {
  const now = new Date();
  const ms = due.getTime() - now.getTime();
  const isOverdue = ms < 0;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const hh = `${String(due.getHours()).padStart(2, "0")}:${String(due.getMinutes()).padStart(2, "0")}`;
  if (sameDay(due, now)) return isOverdue ? "今日截止" : `今日 ${hh}`;
  if (sameDay(due, tomorrow)) return `明日 ${hh}`;
  if (isOverdue) return `已截止 ${relativeTime(due)}`;
  const days = Math.ceil(ms / 86400_000);
  if (days <= 7) return `${days} 天后 ${hh}`;
  return `${due.getMonth() + 1}/${due.getDate()} ${hh}`;
}

export default async function StudentDashboardPage() {
  const session = await auth();
  const userId = session!.user.id;
  const now = new Date();

  // 并行：待批作业 / 进行中考试 / 最近成绩 / 未读通知
  const [pendingAssignments, inProgressExams, recentGrades, unreadNotiCount] = await Promise.all([
    // 已发布、未到 dueAt、未被批阅完成
    prisma.assignment.findMany({
      where: {
        publishedAt: { not: null },
        dueAt: { gte: now },
        submissions: {
          none: { studentId: userId, status: { in: ["GRADED", "RETURNED"] } },
        },
      },
      orderBy: { dueAt: "asc" },
      take: 5,
      select: {
        id: true,
        title: true,
        dueAt: true,
        course: { select: { title: true } },
        submissions: {
          where: { studentId: userId },
          select: { status: true },
          take: 1,
        },
      },
    }),
    prisma.examAttempt.findMany({
      where: {
        studentId: userId,
        status: "IN_PROGRESS",
        deadlineAt: { gt: now },
      },
      orderBy: { deadlineAt: "asc" },
      take: 5,
      select: {
        id: true,
        deadlineAt: true,
        exam: { select: { id: true, title: true, course: { select: { title: true } } } },
      },
    }),
    prisma.assignmentSubmission.findMany({
      where: { studentId: userId, status: "GRADED" },
      orderBy: { gradedAt: "desc" },
      take: 3,
      select: {
        id: true,
        finalScore: true,
        assignment: { select: { title: true, totalScore: true } },
      },
    }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);

  // 合并成统一"待办"流，按时间升序
  const todos: TodoRow[] = [
    ...pendingAssignments.map((a) => ({
      kind: "assignment" as const,
      id: a.id,
      title: a.title,
      courseName: a.course.title,
      dueAt: a.dueAt,
      submitted: a.submissions.length > 0 && a.submissions[0].status !== "DRAFT",
    })),
    ...inProgressExams.map((e) => ({
      kind: "exam" as const,
      id: e.exam.id,
      title: e.exam.title,
      courseName: e.exam.course.title,
      deadlineAt: e.deadlineAt,
      attemptId: e.id,
    })),
  ].sort((a, b) => (a.kind === "assignment" ? a.dueAt : a.deadlineAt).getTime() - (b.kind === "assignment" ? b.dueAt : b.deadlineAt).getTime());

  const todoCount = todos.length;

  return (
    <>
      <Topbar crumbs={[{ label: "工作台" }]} />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              欢迎回来，{session?.user.name}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              <span className="num">{pendingAssignments.length}</span> 项待批作业 ·{" "}
              <span className="num">{inProgressExams.length}</span> 场进行中考试 ·{" "}
              <span className="num">{unreadNotiCount}</span> 条未读通知
            </p>
          </div>

          {/* 概览小卡 */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              icon={<FileText className="h-4 w-4" />}
              label="待批作业"
              value={pendingAssignments.length}
              tone="warning"
            />
            <SummaryCard
              icon={<GraduationCap className="h-4 w-4" />}
              label="进行中考试"
              value={inProgressExams.length}
              tone="primary"
            />
            <SummaryCard
              icon={<Bell className="h-4 w-4" />}
              label="未读通知"
              value={unreadNotiCount}
              tone="muted"
            />
            <SummaryCard
              icon={<Trophy className="h-4 w-4" />}
              label="已批作业"
              value={recentGrades.length}
              tone="success"
            />
          </div>

          {/* 待办清单 */}
          <Card>
            <CardContent className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold">待办</h2>
                {todoCount > 0 ? (
                  <Badge variant="warning">{todoCount} 项</Badge>
                ) : (
                  <Badge variant="success">已清空</Badge>
                )}
              </div>
              {todoCount === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-muted/40 p-10 text-center">
                  <p className="text-sm text-muted-foreground">暂无待办作业或进行中考试 ✨</p>
                  <p className="mt-1 text-xs text-subtle-foreground">
                    可以去{" "}
                    <Link href="/problems" className="text-primary hover:underline">
                      练习
                    </Link>{" "}
                    或者看看感兴趣的课程
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {todos.map((t) => (
                    <TodoRowItem key={`${t.kind}:${t.id}`} row={t} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* 最近成绩 */}
          <Card>
            <CardContent className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold">最近成绩</h2>
                <Link href="/submissions" className="text-xs text-primary hover:underline">
                  查看全部 →
                </Link>
              </div>
              {recentGrades.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
                  暂无已批改作业
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {recentGrades.map((g) => {
                    const pct = g.assignment.totalScore > 0 ? Math.round((g.finalScore ?? 0) / g.assignment.totalScore * 100) : 0;
                    const tone = pct >= 85 ? "success" : pct >= 60 ? "warning" : "danger";
                    return (
                      <li key={g.id} className="flex items-center gap-4 py-3.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                          <Trophy className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{g.assignment.title}</div>
                        </div>
                        <Badge variant={tone as "success" | "warning" | "danger"}>
                          <span className="num">{g.finalScore ?? 0}</span>
                          <span className="text-subtle-foreground"> / {g.assignment.totalScore}</span>
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "warning" | "primary" | "muted" | "success";
}) {
  const toneClass = {
    warning: "bg-warning-subtle text-warning",
    primary: "bg-primary-subtle text-primary",
    muted: "bg-muted text-muted-foreground",
    success: "bg-success-subtle text-success",
  }[tone];
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${toneClass}`}>{icon}</div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="num mt-0.5 text-xl font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function TodoRowItem({ row }: { row: TodoRow }) {
  if (row.kind === "assignment") {
    const ms = row.dueAt.getTime() - Date.now();
    const overdue = ms < 0;
    const dueLabelText = dueLabel(row.dueAt);
    const tone = overdue ? "danger" : row.submitted ? "muted" : ms < 86400_000 ? "warning" : "primary";
    const toneClass = {
      warning: "bg-warning-subtle text-warning",
      primary: "bg-primary-subtle text-primary",
      muted: "bg-muted text-muted-foreground",
      danger: "bg-danger-subtle text-danger",
    }[tone];
    return (
      <li>
        <Link href={`/assignments/${row.id}`} className="flex items-center gap-4 py-3.5 hover:bg-muted/40 -mx-2 px-2 rounded-lg transition-colors">
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${toneClass}`}>
            <FileText className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">
              {row.courseName} · {row.title}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {dueLabelText}
              {row.submitted && (
                <Badge variant="success" className="ml-1.5 px-1.5 py-0">
                  已提交
                </Badge>
              )}
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-subtle-foreground" />
        </Link>
      </li>
    );
  }

  // exam
  const ms = row.deadlineAt.getTime() - Date.now();
  const tone = ms < 3600_000 ? "danger" : ms < 86400_000 ? "warning" : "primary";
  const toneClass = {
    warning: "bg-warning-subtle text-warning",
    primary: "bg-primary-subtle text-primary",
    danger: "bg-danger-subtle text-danger",
  }[tone];
  return (
    <li>
      <Link
        href={`/exams/${row.id}/attempt/${row.attemptId}`}
        className="flex items-center gap-4 py-3.5 hover:bg-muted/40 -mx-2 px-2 rounded-lg transition-colors"
      >
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${toneClass}`}>
          <GraduationCap className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {row.courseName} · {row.title}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {dueLabel(row.deadlineAt)} 截止
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-subtle-foreground" />
      </Link>
    </li>
  );
}
