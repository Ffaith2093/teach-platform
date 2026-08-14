import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Topbar } from "@/components/shell/topbar";
import { formatDate, relativeTime } from "@/lib/utils";
import {
  ChevronLeft,
  Clock,
  Users,
  ClipboardCheck,
  CheckCircle2,
  AlertCircle,
  Send,
} from "lucide-react";
import { GradeHeaderActions } from "./_components/grade-header-actions";
import type { AttemptStatus } from "@prisma/client";

export const metadata = { title: "批改考试" };

type StatusFilter = "all" | "todo" | "grading" | "graded";

export default async function GradeExamPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await auth();
  const userId = session!.user.id;
  if (session!.user.role !== "TEACHER") redirect("/login?error=forbidden");

  const exam = await prisma.exam.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      totalScore: true,
      status: true,
      course: {
        select: {
          id: true,
          title: true,
          teachers: { where: { teacherId: userId }, select: { role: true } },
          classes: { select: { class: { select: { id: true, name: true } } } },
        },
      },
    },
  });
  if (!exam) notFound();
  const myRole = exam.course.teachers[0]?.role;
  if (!myRole || (myRole !== "OWNER" && myRole !== "ASSISTANT")) {
    redirect("/t/exams?error=forbidden");
  }
  const isOwner = myRole === "OWNER";
  const isDraft = exam.status === "DRAFT";

  const status: StatusFilter =
    sp.status === "todo" || sp.status === "grading" || sp.status === "graded" ? sp.status : "all";

  const classes = exam.course.classes.map((cc) => cc.class);
  const classIds = classes.map((c) => c.id);
  const studentIds = classIds.length
    ? (
        await prisma.user.findMany({
          where: { classId: { in: classIds } },
          select: { id: true },
        })
      ).map((u) => u.id)
    : [];

  const students = classIds.length
    ? await prisma.user.findMany({
        where: { classId: { in: classIds } },
        select: { id: true, name: true, studentNo: true, class: { select: { name: true } } },
        orderBy: [{ studentNo: "asc" }, { name: "asc" }],
      })
    : [];
  const studentById = new Map(students.map((s) => [s.id, s]));

  const attempts = studentIds.length
    ? await prisma.examAttempt.findMany({
        where: { examId: id, studentId: { in: studentIds } },
        select: {
          id: true,
          studentId: true,
          status: true,
          autoScore: true,
          manualScore: true,
          finalScore: true,
          submittedAt: true,
          deadlineAt: true,
        },
        orderBy: [{ submittedAt: "desc" }, { startedAt: "desc" }],
      })
    : [];
  const attemptByStudent = new Map(attempts.map((a) => [a.studentId, a]));

  // stats
  const submittedCount = attempts.filter((a) => a.status === "SUBMITTED").length;
  const gradingCount = attempts.filter((a) => a.status === "GRADING").length;
  const gradedCount = attempts.filter((a) => a.status === "GRADED").length;
  const inProgressCount = attempts.filter((a) => a.status === "IN_PROGRESS").length;
  const todoCount = submittedCount + gradingCount;

  const stats = [
    {
      icon: ClipboardCheck,
      label: "待批改",
      num: todoCount,
      tone: "primary" as const,
      hint: submittedCount + gradingCount > 0 ? `已交 ${submittedCount} · 批改中 ${gradingCount}` : undefined,
    },
    { icon: CheckCircle2, label: "已发布", num: gradedCount, tone: "success" as const },
    { icon: Clock, label: "进行中", num: inProgressCount, tone: "warning" as const },
    { icon: Users, label: "应到", num: students.length, tone: "muted" as const },
  ];

  // 过滤 + 排序
  const rows = students
    .map((s) => {
      const a = attemptByStudent.get(s.id);
      return { student: s, attempt: a ?? null };
    })
    .filter(({ attempt }) => {
      if (status === "todo") return attempt?.status === "SUBMITTED";
      if (status === "grading") return attempt?.status === "GRADING";
      if (status === "graded") return attempt?.status === "GRADED";
      return true;
    })
    .sort((a, b) => {
      // 未交卷排在最后；其余按提交时间倒序
      const sa = a.attempt?.submittedAt?.getTime() ?? 0;
      const sb = b.attempt?.submittedAt?.getTime() ?? 0;
      if ((sa === 0) !== (sb === 0)) return sa === 0 ? 1 : -1;
      return sb - sa;
    });

  const statusTabs: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "todo", label: "待批改" },
    { key: "grading", label: "批改中" },
    { key: "graded", label: "已发布" },
  ];

  return (
    <>
      <Topbar
        crumbs={[
          { label: "我的试卷", href: "/t/exams" },
          { label: exam.title, href: `/t/exams/${exam.id}` },
          { label: "批改" },
        ]}
      />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div>
            <Link
              href={`/t/exams/${exam.id}`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-3 w-3" />
              返回试卷详情
            </Link>
            <div className="mt-2 flex items-end justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight">批改 · {exam.title}</h1>
                  <Badge variant="primary">{exam.course.title}</Badge>
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  共 <span className="num">{students.length}</span> 人 · 涵盖
                  <span className="num"> {classes.length}</span> 个班级
                </p>
              </div>
              {!isDraft && (
                <GradeHeaderActions
                  examId={exam.id}
                  isOwner={isOwner}
                  todoCount={todoCount}
                />
              )}
            </div>
          </div>

          {isDraft ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <AlertCircle className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">试卷尚未发布</p>
                <p className="text-xs text-muted-foreground">发布后再来批改。</p>
              </CardContent>
            </Card>
          ) : (
            <>
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
                        {s.hint && <div className="mt-1 text-xs text-muted-foreground">{s.hint}</div>}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3">
                <span className="text-xs text-muted-foreground">状态：</span>
                {statusTabs.map((t) => {
                  const active = status === t.key;
                  const href = `/t/exams/${exam.id}/grade${t.key !== "all" ? `?status=${t.key}` : ""}`;
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

              {students.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                    <Users className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">关联班级暂无学生</p>
                  </CardContent>
                </Card>
              ) : rows.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                    <CheckCircle2 className="h-8 w-8 text-success" />
                    <p className="text-sm font-medium text-foreground">
                      {statusTabs.find((t) => t.key === status)?.label}暂无内容
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                          <th className="px-6 py-3">学号</th>
                          <th className="px-6 py-3">姓名</th>
                          <th className="px-6 py-3">班级</th>
                          <th className="px-6 py-3">提交时间</th>
                          <th className="px-6 py-3 text-right">客观</th>
                          <th className="px-6 py-3 text-right">手动</th>
                          <th className="px-6 py-3 text-right">总分</th>
                          <th className="px-6 py-3">状态</th>
                          <th className="w-32 px-6 py-3 text-right">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {rows.map(({ student, attempt }) => (
                          <Row
                            key={student.id}
                            examId={exam.id}
                            student={student}
                            attempt={attempt}
                            totalScore={exam.totalScore}
                          />
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}

function Row({
  examId,
  student,
  attempt,
  totalScore,
}: {
  examId: string;
  student: { id: string; name: string; studentNo: string | null; class: { name: string } | null };
  attempt:
    | {
        id: string;
        status: AttemptStatus;
        autoScore: number | null;
        manualScore: number | null;
        finalScore: number | null;
        submittedAt: Date | null;
      }
    | null;
  totalScore: number;
}) {
  if (!attempt) {
    return (
      <tr className="bg-muted/20 text-muted-foreground">
        <td className="px-6 py-3.5 num font-mono text-xs">{student.studentNo ?? "—"}</td>
        <td className="px-6 py-3.5 font-medium">{student.name}</td>
        <td className="px-6 py-3.5 text-xs text-muted-foreground">
          {student.class?.name ?? "—"}
        </td>
        <td className="px-6 py-3.5 text-xs text-subtle-foreground">—</td>
        <td className="px-6 py-3.5 num text-right text-subtle-foreground">—</td>
        <td className="px-6 py-3.5 num text-right text-subtle-foreground">—</td>
        <td className="px-6 py-3.5 num text-right text-subtle-foreground">—</td>
        <td className="px-6 py-3.5">
          <Badge variant="default">未参加</Badge>
        </td>
        <td className="px-6 py-3.5"></td>
      </tr>
    );
  }

  const finalShown =
    attempt.finalScore ??
    (attempt.status === "SUBMITTED"
      ? attempt.autoScore
      : (attempt.autoScore ?? 0) + (attempt.manualScore ?? 0));

  return (
    <tr className={attempt.status === "GRADED" ? "bg-success-subtle/10" : ""}>
      <td className="px-6 py-3.5 num font-mono text-xs text-muted-foreground">
        {student.studentNo ?? "—"}
      </td>
      <td className="px-6 py-3.5 font-medium text-foreground">{student.name}</td>
      <td className="px-6 py-3.5 text-xs text-muted-foreground">
        {student.class?.name ?? "—"}
      </td>
      <td className="px-6 py-3.5 num text-xs text-muted-foreground">
        {attempt.submittedAt ? formatDate(attempt.submittedAt) : "—"}
      </td>
      <td className="px-6 py-3.5 num text-right text-muted-foreground">
        {attempt.autoScore ?? "—"}
      </td>
      <td className="px-6 py-3.5 num text-right text-muted-foreground">
        {attempt.manualScore ?? "—"}
      </td>
      <td className="px-6 py-3.5 num text-right">
        {finalShown != null ? (
          <span
            className={
              attempt.status === "GRADED"
                ? finalShown >= totalScore * 0.8
                  ? "font-semibold text-success"
                  : finalShown >= totalScore * 0.6
                    ? "font-medium text-foreground"
                    : "font-medium text-danger"
                : "text-muted-foreground"
            }
          >
            {finalShown}
            <span className="ml-1 text-xs text-subtle-foreground">/ {totalScore}</span>
          </span>
        ) : (
          <span className="text-subtle-foreground">—</span>
        )}
      </td>
      <td className="px-6 py-3.5">
        <StatusBadge status={attempt.status} />
      </td>
      <td className="px-6 py-3.5 text-right">
        {attempt.status === "IN_PROGRESS" ? (
          <span className="text-xs text-subtle-foreground">作答中</span>
        ) : (
          <Link
            href={`/t/exams/${examId}/grade/${attempt.id}`}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <ClipboardCheck className="h-3 w-3" />
            {attempt.status === "GRADED" ? "查看" : "批改"}
          </Link>
        )}
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: AttemptStatus }) {
  switch (status) {
    case "IN_PROGRESS":
      return <Badge variant="warning">作答中</Badge>;
    case "SUBMITTED":
      return <Badge variant="default">已交卷</Badge>;
    case "GRADING":
      return <Badge variant="warning">批改中</Badge>;
    case "GRADED":
      return <Badge variant="success">已发布</Badge>;
  }
}