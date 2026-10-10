import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Topbar } from "@/components/shell/topbar";
import {
  Library,
  Plus,
  FileText,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Clock,
  Filter,
} from "lucide-react";
import type { ExamStatus } from "@prisma/client";

export const metadata = { title: "我的试卷" };

type StatusFilter = "all" | "draft" | "published" | "closed";

const STATUS_LABEL: Record<ExamStatus, { label: string; tone: "default" | "success" | "warning" }> = {
  DRAFT: { label: "草稿", tone: "default" },
  PUBLISHED: { label: "已发布", tone: "success" },
  CLOSED: { label: "已截止", tone: "warning" },
};

export default async function TeacherExamsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; courseId?: string }>;
}) {
  const session = await auth();
  const userId = session!.user.id;
  const sp = await searchParams;

  if (session!.user.role !== "TEACHER") {
    redirect("/login?error=forbidden");
  }

  const status: StatusFilter =
    sp.status === "draft" || sp.status === "published" || sp.status === "closed"
      ? sp.status
      : "all";
  const courseFilter = sp.courseId ?? "";

  // 我作为主讲/助教的所有课程
  const memberships = await prisma.courseTeacher.findMany({
    where: { teacherId: userId, role: { in: ["OWNER", "ASSISTANT"] } },
    select: { courseId: true, course: { select: { title: true, isArchived: true } } },
  });
  const myCourseIds = memberships.filter((m) => !m.course.isArchived).map((m) => m.courseId);

  if (myCourseIds.length === 0) {
    return (
      <>
        <Topbar crumbs={[{ label: "我的试卷" }]} />
        <main className="flex-1 p-8">
          <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
            <h1 className="text-2xl font-semibold tracking-tight">我的试卷</h1>
            <Card>
              <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Library className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium text-foreground">您尚未加入任何课程</p>
                <p className="text-xs text-muted-foreground">
                  请联系管理员把您加入课程后再来创建试卷。
                </p>
              </CardContent>
            </Card>
          </div>
        </main>
      </>
    );
  }

  const allExams = await prisma.exam.findMany({
    where: {
      courseId: { in: myCourseIds },
      ...(courseFilter ? { courseId: courseFilter } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      course: { select: { title: true } },
      classSessions: { select: { status: true } },
      _count: { select: { questions: true, attempts: true } },
    },
    take: 300,
  });

  function lifecycle(exam: (typeof allExams)[number]): "draft" | "published" | "closed" {
    if (exam.status === "DRAFT") return "draft";
    if (exam.status === "CLOSED") return "closed";
    if (exam.classSessions.length > 0 && exam.classSessions.every((item) => item.status === "CLOSED")) return "closed";
    return "published";
  }
  const exams = status === "all" ? allExams : allExams.filter((exam) => lifecycle(exam) === status);

  // 全局 stats
  const [attemptCount] = await Promise.all([
    prisma.examAttempt.count({
      where: { exam: { courseId: { in: myCourseIds } } },
    }),
  ]);
  const draftCount = allExams.filter((exam) => lifecycle(exam) === "draft").length;
  const publishedCount = allExams.filter((exam) => lifecycle(exam) === "published").length;
  const closedCount = allExams.filter((exam) => lifecycle(exam) === "closed").length;

  const stats = [
    { icon: FileText, label: "草稿", num: draftCount },
    { icon: CheckCircle2, label: "已发布", num: publishedCount, accent: true },
    { icon: AlertCircle, label: "全部结束", num: closedCount },
    { icon: Clock, label: "总参考人次", num: attemptCount, muted: true },
  ];

  const statusTabs: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "draft", label: "草稿" },
    { key: "published", label: "已发布" },
    { key: "closed", label: "全部结束" },
  ];

  return (
    <>
      <Topbar crumbs={[{ label: "我的试卷" }]} />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">我的试卷</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                从题库选择编程题、填空题和选择题组卷，并按班级开放考试。
              </p>
            </div>
            <Link
              href="/t/exams/new"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
            >
              <Plus className="h-4 w-4" />
              新建试卷
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
                          s.accent
                            ? "bg-primary-subtle text-primary"
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
                const href = `/t/exams${qs.toString() ? `?${qs}` : ""}`;
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
                  href={`/t/exams${status !== "all" ? `?status=${status}` : ""}`}
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
                        href={`/t/exams?${qs}`}
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

          {exams.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Library className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {status === "all" ? "还没有任何试卷" : `没有${statusTabs.find((t) => t.key === status)?.label}的试卷`}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    点击右上角「新建试卷」开始创建
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
                      <th className="px-6 py-3">班级场次</th>
                      <th className="px-6 py-3">时长</th>
                      <th className="px-6 py-3 text-right">题目</th>
                      <th className="px-6 py-3 text-right">总分</th>
                      <th className="px-6 py-3 text-right">参考</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {exams.map((e) => {
                      const state = lifecycle(e);
                      const openCount = e.classSessions.filter((item) => item.status === "OPEN").length;
                      const closedSessionCount = e.classSessions.filter((item) => item.status === "CLOSED").length;
                      const st = state === "draft"
                        ? STATUS_LABEL.DRAFT
                        : state === "closed"
                          ? STATUS_LABEL.CLOSED
                          : openCount > 0
                            ? { label: "有班级进行中", tone: "success" as const }
                            : { label: "等待班级开考", tone: "default" as const };
                      return (
                        <tr
                          key={e.id}
                          className="group transition-colors hover:bg-muted/30"
                        >
                          <td className="px-6 py-3.5">
                            <Link
                              href={`/t/exams/${e.id}`}
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
                          <td className="px-6 py-3.5">
                            <Badge variant={st.tone}>{st.label}</Badge>
                          </td>
                          <td className="px-6 py-3.5 text-xs text-muted-foreground">
                            <div className="num">进行中 {openCount} 个</div>
                            <div className="text-[11px] text-subtle-foreground">已结束 {closedSessionCount} 个</div>
                          </td>
                          <td className="px-6 py-3.5 num text-muted-foreground">
                            {e.durationMin}m
                          </td>
                          <td className="px-6 py-3.5 num text-right text-muted-foreground">
                            {e._count.questions}
                          </td>
                          <td className="px-6 py-3.5 num text-right text-muted-foreground">
                            {e.totalScore}
                          </td>
                          <td className="px-6 py-3.5 num text-right text-muted-foreground">
                            {e._count.attempts}
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
