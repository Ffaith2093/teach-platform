import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Topbar } from "@/components/shell/topbar";
import {
  ArrowRight,
  Clock,
  FileText,
  GraduationCap,
  Bell,
  Trophy,
  BookOpen,
  Megaphone,
  Users,
  ChevronRight,
  Activity,
  Flame,
} from "lucide-react";
import { formatDate, relativeTime } from "@/lib/utils";
import type { CourseCategory } from "@prisma/client";

const CATEGORY_LABELS: Record<CourseCategory, string> = {
  DATA: "数据",
  ALGORITHM: "算法",
  AI: "人工智能",
  NETWORK: "计算机网络",
  INTERDISCIPLINARY: "多学科交叉",
};

const CATEGORY_GRADIENT: Record<CourseCategory, string> = {
  DATA: "from-sky-400 to-blue-500",
  ALGORITHM: "from-violet-400 to-purple-500",
  AI: "from-emerald-400 to-teal-500",
  NETWORK: "from-orange-400 to-rose-500",
  INTERDISCIPLINARY: "from-pink-400 to-fuchsia-500",
};

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

  // 学生所在班级（用于查我的课程 + 班级公告 widget 过滤）
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { classId: true },
  });

  // 并行：待批作业 / 进行中考试 / 最近成绩 / 未读通知 / 班级公告 widget / 我的出勤
  const [pendingAssignments, inProgressExams, recentGrades, unreadNotiCount, recentNotis, myAccessLogs] =
    await Promise.all([
      // 已发布、未被批阅完成（含已逾期未交的——逾期提醒学生）
      prisma.assignment.findMany({
        where: {
          publishedAt: { not: null },
          submissions: {
            none: { studentId: userId, status: { in: ["GRADED", "RETURNED"] } },
          },
        },
        orderBy: { dueAt: "asc" },
        take: 10,
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
      // 「班级公告」widget 只显示 classId 命中的通知（教师发的班级公告），
      // 课程公告/系统通知走 /notifications 中心。
      prisma.notification.findMany({
        where: { userId, classId: me?.classId ?? "__none__" },
        orderBy: [{ createdAt: "desc" }],
        take: 5,
        select: {
          id: true,
          title: true,
          body: true,
          href: true,
          isRead: true,
          createdAt: true,
        },
      }),
      // 我的出勤：过去 30 天的所有访问日志
      prisma.accessLog.findMany({
        where: {
          userId,
          createdAt: { gte: new Date(now.getTime() - 30 * 86400_000) },
        },
        select: { createdAt: true, courseId: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  // 我的课程（按班级归属，未归档，最多 3 门）
  const myCourses = me?.classId
    ? await prisma.course.findMany({
        where: {
          isArchived: false,
          classes: { some: { classId: me.classId } },
        },
        orderBy: [{ category: "asc" }, { createdAt: "desc" }],
        take: 3,
        select: {
          id: true,
          title: true,
          category: true,
          semester: true,
          _count: { select: { classes: true, assignments: true, exams: true } },
          teachers: {
            orderBy: [{ role: "asc" }],
            take: 1,
            select: { teacher: { select: { name: true } } },
          },
        },
      })
    : [];
  const myCourseIds = myCourses.map((c) => c.id);

  // 每门课的待办数（待批作业 + 进行中考试）
  const todoByCourse = new Map<string, number>();
  if (myCourseIds.length > 0) {
    const [pendingByC, inProgressByC] = await Promise.all([
      prisma.assignment.findMany({
        where: {
          courseId: { in: myCourseIds },
          publishedAt: { not: null },
          dueAt: { gte: now },
          submissions: {
            none: { studentId: userId, status: { in: ["GRADED", "RETURNED"] } },
          },
        },
        select: { courseId: true },
      }),
      prisma.examAttempt.findMany({
        where: {
          studentId: userId,
          status: "IN_PROGRESS",
          deadlineAt: { gt: now },
          exam: { courseId: { in: myCourseIds } },
        },
        select: { exam: { select: { courseId: true } } },
      }),
    ]);
    for (const a of pendingByC) {
      todoByCourse.set(a.courseId, (todoByCourse.get(a.courseId) ?? 0) + 1);
    }
    for (const e of inProgressByC) {
      const cid = e.exam.courseId;
      todoByCourse.set(cid, (todoByCourse.get(cid) ?? 0) + 1);
    }
  }

  // 合并成统一"待办"流
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
  ];
  // 排序：逾期未交（最高优先级）> 其他按截止升序
  todos.sort((a, b) => {
    const aKey = a.kind === "assignment" ? a.dueAt : a.deadlineAt;
    const bKey = b.kind === "assignment" ? b.dueAt : b.deadlineAt;
    const aOverdueUnsubmitted =
      a.kind === "assignment" && a.dueAt < now && !a.submitted;
    const bOverdueUnsubmitted =
      b.kind === "assignment" && b.dueAt < now && !b.submitted;
    if (aOverdueUnsubmitted !== bOverdueUnsubmitted) {
      return aOverdueUnsubmitted ? -1 : 1;
    }
    return aKey.getTime() - bKey.getTime();
  });

  const overdueCount = todos.filter(
    (t) => t.kind === "assignment" && t.dueAt < now && !t.submitted,
  ).length;

  const todoCount = todos.length;

  // ========== 我的出勤（基于 30 天内 AccessLog）==========
  // 仅统计 courseId != null 的访问（学生在课程页打点）
  const courseLogs = myAccessLogs.filter((l) => l.courseId != null);
  const visitedDays = new Set<string>();
  const todayKey = new Date(now).toISOString().slice(0, 10);
  for (const log of courseLogs) {
    visitedDays.add(new Date(log.createdAt).toISOString().slice(0, 10));
  }
  const todayVisited = visitedDays.has(todayKey);

  // 7 天 daily（按时间正序，今天在最右）
  const sevenDayGrid: { date: string; weekday: string; visited: boolean }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    sevenDayGrid.push({
      date: key,
      weekday: ["日", "一", "二", "三", "四", "五", "六"][d.getDay()],
      visited: visitedDays.has(key),
    });
  }

  // 7 天活跃天数（不含今天只看过去 7 天内的去重日期）
  const sevenDaysAgoKey = new Date(now.getTime() - 6 * 86400_000)
    .toISOString()
    .slice(0, 10);
  const sevenDayActive = [...visitedDays].filter((d) => d >= sevenDaysAgoKey).length;
  // 30 天活跃天数
  const thirtyDaysAgoKey = new Date(now.getTime() - 29 * 86400_000)
    .toISOString()
    .slice(0, 10);
  const thirtyDayActive = [...visitedDays].filter((d) => d >= thirtyDaysAgoKey).length;

  // 连续天数（从今天向前数）
  let streak = 0;
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  while (true) {
    const key = cursor.toISOString().slice(0, 10);
    if (visitedDays.has(key)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

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
                <div className="flex items-center gap-2">
                  {overdueCount > 0 && (
                    <Badge variant="danger">{overdueCount} 项逾期</Badge>
                  )}
                  {todoCount > 0 ? (
                    <Badge variant="warning">{todoCount} 项</Badge>
                  ) : (
                    <Badge variant="success">已清空</Badge>
                  )}
                </div>
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

          {/* 我的课程 + 班级公告 */}
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Card className="h-full">
                <CardContent className="flex h-full flex-col p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-primary" />
                      <h2 className="text-base font-semibold">我的课程</h2>
                    </div>
                    <Link
                      href="/courses"
                      className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
                    >
                      查看全部
                      <ChevronRight className="h-3 w-3" />
                    </Link>
                  </div>
                  {myCourses.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 p-8 text-center">
                      <p className="text-sm text-muted-foreground">您尚未加入任何课程</p>
                      <p className="mt-1 text-xs text-subtle-foreground">
                        请联系管理员把您加入班级后再来查看课程。
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {myCourses.map((c) => {
                        const todo = todoByCourse.get(c.id) ?? 0;
                        const teacherName = c.teachers[0]?.teacher.name;
                        return (
                          <Link
                            key={c.id}
                            href={`/courses/${c.id}`}
                            className="group block"
                          >
                            <div className="overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/40 hover:shadow-sm">
                              <div
                                className={`relative h-20 bg-gradient-to-br ${CATEGORY_GRADIENT[c.category]} px-4 pt-3`}
                              >
                                <Badge
                                  variant="default"
                                  className="bg-white/90 text-foreground backdrop-blur"
                                >
                                  {CATEGORY_LABELS[c.category]}
                                </Badge>
                                {todo > 0 && (
                                  <Badge
                                    variant="warning"
                                    className="absolute right-3 top-3"
                                  >
                                    {todo} 项待办
                                  </Badge>
                                )}
                              </div>
                              <div className="p-4">
                                <h3 className="line-clamp-1 text-sm font-semibold tracking-tight text-foreground group-hover:text-primary">
                                  {c.title}
                                </h3>
                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                  {c.semester}
                                </p>
                                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-subtle-foreground">
                                  {teacherName && (
                                    <span className="inline-flex items-center gap-1">
                                      <Users className="h-3 w-3" />
                                      {teacherName}
                                    </span>
                                  )}
                                  <span>
                                    <span className="num">{c._count.classes}</span> 班
                                  </span>
                                  <span>
                                    <span className="num">{c._count.assignments}</span> 作业
                                  </span>
                                </div>
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
            <div className="lg:col-span-1">
              <Card className="h-full">
                <CardContent className="flex h-full flex-col p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Megaphone className="h-4 w-4 text-primary" />
                      <h2 className="text-base font-semibold">班级公告</h2>
                    </div>
                    <Link
                      href="/notifications"
                      className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
                    >
                      查看全部
                      <ChevronRight className="h-3 w-3" />
                    </Link>
                  </div>
                  {recentNotis.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 p-8 text-center">
                      <p className="text-sm text-muted-foreground">暂无公告</p>
                      <p className="mt-1 text-xs text-subtle-foreground">
                        教师发布的班级公告会显示在这里。
                      </p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-border">
                      {recentNotis.map((n) => {
                        const inner = (
                          <div className="flex items-start gap-3 py-3">
                            <div
                              className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                                n.isRead
                                  ? "bg-muted text-muted-foreground"
                                  : "bg-primary-subtle text-primary"
                              }`}
                            >
                              <Bell className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`truncate text-sm font-medium ${
                                    n.isRead ? "text-foreground" : "text-foreground"
                                  }`}
                                >
                                  {n.title}
                                </span>
                                {!n.isRead && (
                                  <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                                )}
                              </div>
                              <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                                {n.body}
                              </p>
                              <div className="mt-0.5 text-[11px] text-subtle-foreground">
                                <span className="num">{relativeTime(n.createdAt)}</span>
                                <span className="mx-1">·</span>
                                <span className="num">{formatDate(n.createdAt)}</span>
                              </div>
                            </div>
                          </div>
                        );
                        return (
                          <li key={n.id}>
                            {n.href ? (
                              <Link
                                href={n.href}
                                className="-mx-2 block rounded-lg px-2 transition-colors hover:bg-muted/40"
                              >
                                {inner}
                              </Link>
                            ) : (
                              <div className="-mx-2 px-2">{inner}</div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* 我的出勤 */}
          <Card>
            <CardContent className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  <h2 className="text-base font-semibold">我的出勤</h2>
                  <span className="text-[11px] text-subtle-foreground">
                    基于课程页访问打点
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {streak > 0 && (
                    <Badge variant="warning" className="inline-flex items-center gap-1">
                      <Flame className="h-3 w-3" />
                      连续 <span className="num">{streak}</span> 天
                    </Badge>
                  )}
                  {todayVisited ? (
                    <Badge variant="success">今日已到课</Badge>
                  ) : (
                    <Badge variant="warning">今日未访问</Badge>
                  )}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <MiniAttendanceStat
                  label="今日到课"
                  value={todayVisited ? "已到" : "未到"}
                  tone={todayVisited ? "success" : "warning"}
                />
                <MiniAttendanceStat
                  label="7 天活跃"
                  value={`${sevenDayActive}/7`}
                  tone={sevenDayActive >= 5 ? "success" : sevenDayActive >= 3 ? "warning" : "danger"}
                />
                <MiniAttendanceStat
                  label="30 天活跃"
                  value={`${thirtyDayActive}/30`}
                  tone={thirtyDayActive >= 20 ? "success" : thirtyDayActive >= 10 ? "warning" : "danger"}
                />
              </div>
              <div className="mt-5">
                <div className="mb-2 text-xs text-muted-foreground">过去 7 天访问课程页情况</div>
                <div className="grid grid-cols-7 gap-2">
                  {sevenDayGrid.map((c) => {
                    const isToday = c.date === todayKey;
                    return (
                      <div
                        key={c.date}
                        className={`flex h-16 flex-col items-center justify-center rounded-lg border transition-colors ${
                          c.visited
                            ? isToday
                              ? "border-primary/40 bg-primary-subtle"
                              : "border-success/30 bg-success-subtle"
                            : "border-border bg-muted/30"
                        }`}
                      >
                        <span className="text-[10px] text-subtle-foreground">{c.weekday}</span>
                        {c.visited ? (
                          <Activity
                            className={`mt-0.5 h-3.5 w-3.5 ${isToday ? "text-primary" : "text-success"}`}
                          />
                        ) : (
                          <span className="mt-0.5 text-[10px] text-subtle-foreground">—</span>
                        )}
                        <span className="num text-[10px] text-subtle-foreground">
                          {parseInt(c.date.slice(5, 7), 10)}/{parseInt(c.date.slice(8, 10), 10)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
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

function MiniAttendanceStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "danger";
}) {
  const toneClass = {
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  }[tone];
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`num mt-1 text-xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function TodoRowItem({ row }: { row: TodoRow }) {
  if (row.kind === "assignment") {
    const ms = row.dueAt.getTime() - Date.now();
    const overdue = ms < 0;
    const overdueUnsubmitted = overdue && !row.submitted;
    const dueLabelText = dueLabel(row.dueAt);
    const tone = overdueUnsubmitted
      ? "danger"
      : overdue && row.submitted
        ? "muted"
        : row.submitted
          ? "muted"
          : ms < 86400_000
            ? "warning"
            : "primary";
    const toneClass = {
      warning: "bg-warning-subtle text-warning",
      primary: "bg-primary-subtle text-primary",
      muted: "bg-muted text-muted-foreground",
      danger: "bg-danger-subtle text-danger",
    }[tone];
    return (
      <li>
        <Link
          href={`/assignments/${row.id}`}
          className={`flex items-center gap-4 rounded-lg px-2 py-3.5 transition-colors hover:bg-muted/40 ${
            overdueUnsubmitted ? "-mx-2 bg-danger-subtle/20" : "-mx-2"
          }`}
        >
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${toneClass}`}>
            <FileText className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">
              {row.courseName} · {row.title}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {overdueUnsubmitted ? (
                <span className="font-medium text-danger">已逾期 {relativeTime(row.dueAt)}</span>
              ) : (
                dueLabelText
              )}
              {row.submitted && (
                <Badge variant="success" className="ml-1.5 px-1.5 py-0">
                  已提交
                </Badge>
              )}
            </div>
          </div>
          {overdueUnsubmitted ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-danger px-2 py-0.5 text-[11px] font-medium text-white">
              立即补交
            </span>
          ) : (
            <ArrowRight className="h-4 w-4 text-subtle-foreground" />
          )}
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
