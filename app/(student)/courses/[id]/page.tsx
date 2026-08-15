import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  GraduationCap,
  FileText,
  ChevronRight,
  Clock,
  CheckCircle2,
  Trophy,
  BookOpen,
  Megaphone,
  ArrowRight,
  Bell,
} from "lucide-react";
import { formatDate, relativeTime } from "@/lib/utils";

export const metadata = { title: "课程公告" };

export default async function StudentCourseOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userId = session!.user.id;
  const now = new Date();

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { classId: true },
  });
  if (!me?.classId) notFound();

  // 课程 + 教师 + 班级 + 我的进度 + 本课程动态（待办/进行中考试/最近出分）+ 课程公告
  const [
    course,
    mySubmissions,
    myAttempts,
    pendingAssignments,
    inProgressExams,
    recentGrades,
    courseNotis,
  ] = await Promise.all([
      prisma.course.findFirst({
        where: {
          id,
          isArchived: false,
          classes: { some: { classId: me.classId } },
        },
        include: {
          teachers: {
            include: { teacher: { select: { id: true, name: true, email: true } } },
            orderBy: [{ role: "asc" }],
          },
          classes: {
            include: {
              class: {
                include: { grade: { select: { name: true, joinYear: true } } },
              },
            },
          },
        },
      }),
      prisma.assignmentSubmission.findMany({
        where: { studentId: userId, assignment: { courseId: id } },
        select: { status: true, finalScore: true, assignment: { select: { totalScore: true } } },
      }),
      prisma.examAttempt.findMany({
        where: { studentId: userId, exam: { courseId: id } },
        select: { status: true },
      }),
      // 本课程待办作业：已发布、未到期、未被批阅完成
      prisma.assignment.findMany({
        where: {
          courseId: id,
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
          submissions: {
            where: { studentId: userId },
            select: { status: true },
            take: 1,
          },
        },
      }),
      // 本课程进行中考试
      prisma.examAttempt.findMany({
        where: {
          studentId: userId,
          status: "IN_PROGRESS",
          deadlineAt: { gt: now },
          exam: { courseId: id },
        },
        orderBy: { deadlineAt: "asc" },
        take: 5,
        select: {
          id: true,
          deadlineAt: true,
          exam: { select: { id: true, title: true } },
        },
      }),
      // 本课程最近出分
      prisma.assignmentSubmission.findMany({
        where: {
          studentId: userId,
          status: "GRADED",
          assignment: { courseId: id },
        },
        orderBy: { gradedAt: "desc" },
        take: 3,
        select: {
          id: true,
          finalScore: true,
          gradedAt: true,
          assignment: { select: { id: true, title: true, totalScore: true } },
        },
      }),
      // 课程公告：本课程作用域 + 当前学生
      prisma.notification.findMany({
        where: { userId, courseId: id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          title: true,
          body: true,
          href: true,
          isRead: true,
          createdAt: true,
        },
      }),
    ]);
  if (!course) notFound();

  // 进度统计
  const gradedSubs = mySubmissions.filter((s) => s.status === "GRADED");
  const avgRatio =
    gradedSubs.length === 0
      ? null
      : gradedSubs.reduce((acc, s) => acc + (s.finalScore ?? 0) / (s.assignment.totalScore || 1), 0) /
        gradedSubs.length;

  const teacherCount = course.teachers.length;
  const classCount = course.classes.length;

  const roleLabel = (role: string) =>
    role === "OWNER" ? "主讲" : role === "ASSISTANT" ? "助教" : "外聘";

  return (
    <div className="space-y-6">
      {/* 课程公告 */}
      <Card>
        <CardContent className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">课程公告</h2>
            {courseNotis.length > 0 && (
              <span className="text-[11px] text-subtle-foreground num">
                · {courseNotis.length} 条
              </span>
            )}
          </div>
          {courseNotis.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/40 p-10 text-center">
              <p className="text-sm text-muted-foreground">本课程暂无公告</p>
              <p className="mt-1 text-xs text-subtle-foreground">
                教师发布的课程公告会显示在这里。
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {courseNotis.map((n) => {
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
                        <span className="truncate text-sm font-medium text-foreground">
                          {n.title}
                        </span>
                        {!n.isRead && (
                          <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        )}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {n.body}
                      </p>
                      <div className="mt-1 text-[11px] text-subtle-foreground">
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

      {/* 进度三卡 */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <span className="text-sm text-muted-foreground">平均成绩</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 text-3xl font-bold tracking-tight num">
              {avgRatio == null ? "—" : `${Math.round(avgRatio * 100)}%`}
            </div>
            <p className="mt-1 text-xs text-subtle-foreground">
              {gradedSubs.length === 0 ? "暂无已批改作业" : `基于 ${gradedSubs.length} 次作业`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <span className="text-sm text-muted-foreground">参与班级</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-subtle text-accent">
                <Users className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 text-3xl font-bold tracking-tight num">{classCount}</div>
            <p className="mt-1 text-xs text-subtle-foreground">本课程关联班级</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <span className="text-sm text-muted-foreground">考试场次</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning-subtle text-warning">
                <GraduationCap className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 text-3xl font-bold tracking-tight num">{myAttempts.length}</div>
            <p className="mt-1 text-xs text-subtle-foreground">我参加过的考试</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* 教师列表 */}
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <h2 className="mb-4 text-base font-semibold">任课教师</h2>
            {course.teachers.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
                暂无教师信息
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {course.teachers.map((t) => (
                  <li key={t.id} className="flex items-center gap-4 py-3.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-sm font-semibold text-white">
                      {t.teacher.name.slice(0, 1)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-medium">{t.teacher.name}</div>
                        <Badge variant={t.role === "OWNER" ? "primary" : "default"}>
                          {roleLabel(t.role)}
                        </Badge>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">{t.teacher.email}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* 班级列表 */}
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-4 text-base font-semibold">参与班级</h2>
            {course.classes.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
                暂无班级
              </p>
            ) : (
              <ul className="space-y-2.5">
                {course.classes.map((cc) => (
                  <li
                    key={cc.id}
                    className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3.5 py-2.5"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                      <Users className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {cc.class.grade.name} · {cc.class.name}
                      </div>
                      <div className="text-[11px] text-subtle-foreground">
                        {cc.class.grade.joinYear} 级
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 快捷入口 */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href={`/courses/${id}/resources`} className="group">
          <Card className="transition-all hover:border-primary/40">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-subtle text-primary">
                <BookOpen className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">课程资源</div>
                <div className="mt-0.5 text-xs text-muted-foreground">课件、讲义、参考资料下载</div>
              </div>
              <ChevronRight className="h-4 w-4 text-subtle-foreground transition-colors group-hover:text-primary" />
            </CardContent>
          </Card>
        </Link>
        <Link href={`/assignments?course=${id}`} className="group">
          <Card className="transition-all hover:border-primary/40">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-warning-subtle text-warning">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">作业与考试</div>
                <div className="mt-0.5 text-xs text-muted-foreground">查看本课程的考核任务</div>
              </div>
              <ChevronRight className="h-4 w-4 text-subtle-foreground transition-colors group-hover:text-primary" />
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* 公告：课程动态 widget */}
      <Card>
        <CardContent className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">本课程动态</h2>
          </div>
          {pendingAssignments.length === 0 &&
          inProgressExams.length === 0 &&
          recentGrades.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/40 p-10 text-center">
              <p className="text-sm text-muted-foreground">本课程暂无动态</p>
              <p className="mt-1 text-xs text-subtle-foreground">
                新发布的作业、进行中的考试和批改出分都会显示在这里。
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* 待办作业 */}
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    待办作业
                  </h3>
                  <span className="text-[11px] text-subtle-foreground num">
                    {pendingAssignments.length} 项
                  </span>
                </div>
                {pendingAssignments.length === 0 ? (
                  <p className="text-xs text-subtle-foreground">暂无待办作业</p>
                ) : (
                  <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                    {pendingAssignments.map((a) => (
                      <AssignmentRow
                        key={a.id}
                        href={`/assignments/${a.id}`}
                        title={a.title}
                        dueAt={a.dueAt}
                        submitted={
                          a.submissions.length > 0 &&
                          a.submissions[0].status !== "DRAFT"
                        }
                      />
                    ))}
                  </ul>
                )}
              </section>

              {/* 进行中考试 */}
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    进行中考试
                  </h3>
                  <span className="text-[11px] text-subtle-foreground num">
                    {inProgressExams.length} 场
                  </span>
                </div>
                {inProgressExams.length === 0 ? (
                  <p className="text-xs text-subtle-foreground">暂无进行中的考试</p>
                ) : (
                  <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                    {inProgressExams.map((e) => (
                      <ExamRow
                        key={e.id}
                        href={`/exams/${e.exam.id}/attempt/${e.id}`}
                        title={e.exam.title}
                        deadlineAt={e.deadlineAt}
                      />
                    ))}
                  </ul>
                )}
              </section>

              {/* 最近出分 */}
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    最近出分
                  </h3>
                  <span className="text-[11px] text-subtle-foreground num">
                    {recentGrades.length} 次
                  </span>
                </div>
                {recentGrades.length === 0 ? (
                  <p className="text-xs text-subtle-foreground">暂无新出分</p>
                ) : (
                  <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                    {recentGrades.map((g) => {
                      const pct =
                        g.assignment.totalScore > 0
                          ? Math.round(
                              ((g.finalScore ?? 0) / g.assignment.totalScore) * 100,
                            )
                          : 0;
                      const tone =
                        pct >= 85 ? "success" : pct >= 60 ? "warning" : "danger";
                      return (
                        <li key={g.id}>
                          <Link
                            href={`/assignments/${g.assignment.id}`}
                            className="flex items-center gap-4 px-3 py-3 transition-colors hover:bg-muted/40 rounded-xl"
                          >
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success-subtle text-success">
                              <Trophy className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium">
                                {g.assignment.title}
                              </div>
                              <div className="mt-0.5 text-[11px] text-subtle-foreground">
                                <span className="num">
                                  {relativeTime(g.gradedAt!)}
                                </span>
                                <span className="mx-1">·</span>
                                <span className="num">
                                  {formatDate(g.gradedAt!)}
                                </span>
                              </div>
                            </div>
                            <Badge variant={tone}>
                              <span className="num">{g.finalScore ?? 0}</span>
                              <span className="text-subtle-foreground">
                                {" "}
                                / {g.assignment.totalScore}
                              </span>
                            </Badge>
                            <ArrowRight className="h-4 w-4 text-subtle-foreground" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** 本地复用 dashboard 的相对到期文案（第二次出现，按「三处重复再抽」暂不抽公共） */
function dueLabel(due: Date) {
  const now = new Date();
  const ms = due.getTime() - now.getTime();
  const isOverdue = ms < 0;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  const hh = `${String(due.getHours()).padStart(2, "0")}:${String(due.getMinutes()).padStart(2, "0")}`;
  if (sameDay(due, now)) return isOverdue ? "今日截止" : `今日 ${hh}`;
  if (sameDay(due, tomorrow)) return `明日 ${hh}`;
  if (isOverdue) return `已截止 ${relativeTime(due)}`;
  const days = Math.ceil(ms / 86400_000);
  if (days <= 7) return `${days} 天后 ${hh}`;
  return `${due.getMonth() + 1}/${due.getDate()} ${hh}`;
}

function AssignmentRow({
  href,
  title,
  dueAt,
  submitted,
}: {
  href: string;
  title: string;
  dueAt: Date;
  submitted: boolean;
}) {
  const ms = dueAt.getTime() - Date.now();
  const overdue = ms < 0;
  const tone = overdue
    ? "danger"
    : submitted
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
        href={href}
        className="flex items-center gap-4 px-3 py-3 transition-colors hover:bg-muted/40 rounded-xl"
      >
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneClass}`}>
          <FileText className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{title}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {dueLabel(dueAt)}
            {submitted && (
              <span className="ml-1.5 rounded-md bg-success-subtle px-1.5 py-0 text-[10px] font-medium text-success">
                已提交
              </span>
            )}
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-subtle-foreground" />
      </Link>
    </li>
  );
}

function ExamRow({
  href,
  title,
  deadlineAt,
}: {
  href: string;
  title: string;
  deadlineAt: Date;
}) {
  const ms = deadlineAt.getTime() - Date.now();
  const tone = ms < 3600_000 ? "danger" : ms < 86400_000 ? "warning" : "primary";
  const toneClass = {
    warning: "bg-warning-subtle text-warning",
    primary: "bg-primary-subtle text-primary",
    danger: "bg-danger-subtle text-danger",
  }[tone];
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-4 px-3 py-3 transition-colors hover:bg-muted/40 rounded-xl"
      >
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneClass}`}>
          <GraduationCap className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{title}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {dueLabel(deadlineAt)} 截止
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-subtle-foreground" />
      </Link>
    </li>
  );
}