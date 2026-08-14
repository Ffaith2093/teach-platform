import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Topbar } from "@/components/shell/topbar";
import { relativeTime, formatDate } from "@/lib/utils";
import {
  FileText,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  ClipboardCheck,
  Filter,
} from "lucide-react";

export const metadata = { title: "我的作业" };

type StatusFilter = "all" | "draft" | "published" | "overdue";

export default async function TeacherAssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; courseId?: string }>;
}) {
  const session = await auth();
  const userId = session!.user.id;
  const sp = await searchParams;

  const status: StatusFilter =
    sp.status === "draft" || sp.status === "published" || sp.status === "overdue"
      ? sp.status
      : "all";
  const courseFilter = sp.courseId ?? "";

  const now = new Date();

  // 我作为主讲/助教的所有课程
  const memberships = await prisma.courseTeacher.findMany({
    where: { teacherId: userId, role: { in: ["OWNER", "ASSISTANT"] } },
    select: { courseId: true, course: { select: { title: true, isArchived: true } } },
  });
  const myCourseIds = memberships.filter((m) => !m.course.isArchived).map((m) => m.courseId);
  const coursesMap = new Map(memberships.map((m) => [m.courseId, m.course.title]));

  // 作业列表
  const assignments = await prisma.assignment.findMany({
    where: {
      courseId: { in: myCourseIds.length > 0 ? myCourseIds : ["__none__"] },
      ...(courseFilter ? { courseId: courseFilter } : {}),
      ...(status === "draft" ? { publishedAt: null } : {}),
      ...(status === "published" ? { publishedAt: { not: null }, dueAt: { gte: now } } : {}),
      ...(status === "overdue" ? { publishedAt: { not: null }, dueAt: { lt: now } } : {}),
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    include: {
      course: { select: { title: true, isArchived: true } },
      _count: { select: { problems: true, submissions: true } },
      problems: { select: { problemId: true } },
    },
    take: 100,
  });

  // Stats（基于全部 active 课程作业）
  const [draftCount, publishedCount, overdueCount, toGrade] = await Promise.all([
    prisma.assignment.count({
      where: { courseId: { in: myCourseIds }, publishedAt: null },
    }),
    prisma.assignment.count({
      where: { courseId: { in: myCourseIds }, publishedAt: { not: null }, dueAt: { gte: now } },
    }),
    prisma.assignment.count({
      where: { courseId: { in: myCourseIds }, publishedAt: { not: null }, dueAt: { lt: now } },
    }),
    prisma.assignmentSubmission.count({
      where: {
        status: "SUBMITTED",
        gradedById: null,
        assignment: { courseId: { in: myCourseIds } },
      },
    }),
  ]);

  const stats = [
    { icon: FileText, label: "草稿", num: draftCount },
    { icon: CheckCircle2, label: "进行中", num: publishedCount, accent: true },
    { icon: AlertCircle, label: "已截止", num: overdueCount },
    { icon: ClipboardCheck, label: "待批改", num: toGrade, warning: true },
  ];

  // 已批改 + 平均分（用于列表展示）
  const allSubmissions = await prisma.assignmentSubmission.findMany({
    where: {
      assignmentId: { in: assignments.map((a) => a.id) },
      finalScore: { not: null },
    },
    select: { assignmentId: true, finalScore: true },
  });
  const statsByAssignment = new Map<string, { graded: number; avg: number | null }>();
  for (const a of assignments) {
    const subs = allSubmissions.filter((s) => s.assignmentId === a.id);
    const graded = subs.length;
    const avg =
      graded > 0 ? Math.round(subs.reduce((s, x) => s + (x.finalScore ?? 0), 0) / graded) : null;
    statsByAssignment.set(a.id, { graded, avg });
  }

  const statusTabs: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "draft", label: "草稿" },
    { key: "published", label: "进行中" },
    { key: "overdue", label: "已截止" },
  ];

  return (
    <>
      <Topbar crumbs={[{ label: "我的作业" }]} />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">我的作业</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                在您主讲或助教的课程里创建作业，挂载编程题、设置截止与迟交规则。
              </p>
            </div>
            <Link
              href="/t/assignments/new"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
            >
              <Plus className="h-4 w-4" />
              新建作业
            </Link>
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
                const qs = new URLSearchParams();
                if (t.key !== "all") qs.set("status", t.key);
                if (courseFilter) qs.set("courseId", courseFilter);
                const href = `/t/assignments${qs.toString() ? `?${qs}` : ""}`;
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

            {myCourseIds.length > 1 && (
              <div className="flex items-center gap-2 border-l border-border pl-3">
                <span className="text-xs text-muted-foreground">课程：</span>
                <Link
                  href={`/t/assignments${status !== "all" ? `?status=${status}` : ""}`}
                  className={`rounded-md px-2 py-1 text-xs ${
                    !courseFilter
                      ? "bg-primary-subtle font-medium text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  全部
                </Link>
                {memberships
                  .filter((m) => !m.course.isArchived)
                  .map((m) => {
                    const active = courseFilter === m.courseId;
                    const qs = new URLSearchParams();
                    if (status !== "all") qs.set("status", status);
                    qs.set("courseId", m.courseId);
                    return (
                      <Link
                        key={m.courseId}
                        href={`/t/assignments?${qs}`}
                        className={`max-w-[140px] truncate rounded-md px-2 py-1 text-xs ${
                          active
                            ? "bg-primary-subtle font-medium text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        {m.course.title}
                      </Link>
                    );
                  })}
              </div>
            )}
          </div>

          {assignments.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {status === "all" ? "还没有任何作业" : `没有${statusTabs.find((t) => t.key === status)?.label}作业`}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {status === "all"
                      ? "点击右上角「新建作业」开始创建，或先在课程里添加编程题。"
                      : "切换其他状态或新建一份作业。"}
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
                      <th className="px-6 py-3">状态</th>
                      <th className="px-6 py-3">截止</th>
                      <th className="px-6 py-3 text-right">题目</th>
                      <th className="px-6 py-3 text-right">提交 / 已批改</th>
                      <th className="px-6 py-3 text-right">均分</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {assignments.map((a) => {
                      const isDraft = !a.publishedAt;
                      const isOverdue = a.publishedAt && a.dueAt < now;
                      const st = statsByAssignment.get(a.id);
                      return (
                        <tr
                          key={a.id}
                          className="group transition-colors hover:bg-muted/30"
                        >
                          <td className="px-6 py-3.5">
                            <Link
                              href={`/t/assignments/${a.id}`}
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
                          <td className="px-6 py-3.5">
                            {isDraft ? (
                              <Badge variant="default">草稿</Badge>
                            ) : isOverdue ? (
                              <Badge variant="default">已截止</Badge>
                            ) : (
                              <Badge variant="success">进行中</Badge>
                            )}
                          </td>
                          <td className="px-6 py-3.5 text-xs text-muted-foreground">
                            <div className="num">{formatDate(a.dueAt)}</div>
                            <div className="text-[11px] text-subtle-foreground">
                              {isDraft
                                ? "未发布"
                                : isOverdue
                                  ? `${relativeTime(a.dueAt)}截止`
                                  : `${relativeTime(a.dueAt)}截止`}
                            </div>
                          </td>
                          <td className="px-6 py-3.5 text-right num text-muted-foreground">
                            {a._count.problems}
                          </td>
                          <td className="px-6 py-3.5 text-right text-xs num">
                            <span className="text-foreground">{a._count.submissions}</span>
                            <span className="text-muted-foreground"> / </span>
                            <span className="text-muted-foreground">{st?.graded ?? 0}</span>
                          </td>
                          <td className="px-6 py-3.5 text-right num">
                            {st?.avg != null ? (
                              <span
                                className={
                                  st.avg >= 80
                                    ? "text-success"
                                    : st.avg >= 60
                                      ? "text-foreground"
                                      : "text-danger"
                                }
                              >
                                {st.avg}
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