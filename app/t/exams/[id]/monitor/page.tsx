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
  Clock,
  PlayCircle,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import { Countdown } from "./_components/countdown";
import type { AttemptStatus } from "@prisma/client";

export const metadata = { title: "监考视图" };

const STATUS_LABELS: Record<AttemptStatus, { label: string; tone: "default" | "warning" | "primary" | "success" }> = {
  IN_PROGRESS: { label: "进行中", tone: "warning" },
  SUBMITTED: { label: "已交卷", tone: "primary" },
  GRADING: { label: "批改中", tone: "warning" },
  GRADED: { label: "已发布", tone: "success" },
};

export default async function ExamMonitorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userId = session!.user.id;
  if (session!.user.role !== "TEACHER") redirect("/login?error=forbidden");

  const exam = await prisma.exam.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      durationMin: true,
      openAt: true,
      closeAt: true,
      totalScore: true,
      status: true,
      showResultMode: true,
      course: {
        select: {
          id: true,
          title: true,
          teachers: { where: { teacherId: userId }, select: { role: true } },
          classes: {
            select: {
              class: {
                select: {
                  id: true,
                  name: true,
                  grade: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!exam) notFound();
  const myRole = exam.course.teachers[0]?.role;
  if (!myRole || (myRole !== "OWNER" && myRole !== "ASSISTANT")) {
    redirect("/t/exams?error=forbidden");
  }

  const classIds = exam.course.classes.map((cc) => cc.class.id);
  const totalQuestions = await prisma.examQuestion.count({ where: { examId: id } });

  // 拉所有学生 + attempt + 已答题数
  const students = classIds.length
    ? await prisma.user.findMany({
        where: { role: "STUDENT", status: "ACTIVE", classId: { in: classIds } },
        orderBy: [{ studentNo: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          studentNo: true,
          class: { select: { id: true, name: true, grade: { select: { name: true } } } },
        },
      })
    : [];
  const attempts = students.length
    ? await prisma.examAttempt.findMany({
        where: { examId: id, studentId: { in: students.map((s) => s.id) } },
        select: {
          id: true,
          studentId: true,
          status: true,
          autoScore: true,
          startedAt: true,
          submittedAt: true,
          deadlineAt: true,
          _count: { select: { answers: true } },
        },
      })
    : [];
  const attemptByStudent = new Map(attempts.map((a) => [a.studentId, a]));

  // 按班级分组
  const groupedByClass = new Map<
    string,
    { classId: string; className: string; gradeName: string; rows: typeof students }
  >();
  for (const s of students) {
    if (!s.class) continue;
    const key = s.class.id;
    if (!groupedByClass.has(key)) {
      groupedByClass.set(key, {
        classId: key,
        className: s.class.name,
        gradeName: s.class.grade.name,
        rows: [],
      });
    }
    groupedByClass.get(key)!.rows.push(s);
  }
  const groups = Array.from(groupedByClass.values()).sort((a, b) =>
    a.gradeName === b.gradeName ? a.className.localeCompare(b.className) : a.gradeName.localeCompare(b.gradeName),
  );

  // stats
  const notStarted = students.filter((s) => !attemptByStudent.has(s.id)).length;
  const inProgress = attempts.filter((a) => a.status === "IN_PROGRESS").length;
  const submitted = attempts.filter((a) => a.status === "SUBMITTED" || a.status === "GRADING" || a.status === "GRADED").length;
  const now = Date.now();
  const examInWindow = now >= exam.openAt.getTime() && now < exam.closeAt.getTime();
  const examClosed = now >= exam.closeAt.getTime();

  const stats = [
    { icon: Users, label: "应到", num: students.length, tone: "muted" as const },
    { icon: PlayCircle, label: "进行中", num: inProgress, tone: "warning" as const },
    { icon: CheckCircle2, label: "已交卷", num: submitted, tone: "success" as const },
    { icon: AlertCircle, label: "未开始", num: notStarted, tone: "muted" as const },
  ];

  return (
    <>
      <Topbar
        crumbs={[
          { label: "我的试卷", href: "/t/exams" },
          { label: exam.title, href: `/t/exams/${exam.id}` },
          { label: "监考" },
        ]}
      />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <Link
            href={`/t/exams/${exam.id}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            返回考试详情
          </Link>

          {/* 考试头部 + 倒计时 */}
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5">
                    <GraduationCap className="h-5 w-5 text-primary" />
                    <h1 className="text-2xl font-semibold tracking-tight">{exam.title}</h1>
                    <Badge variant={examClosed ? "default" : examInWindow ? "success" : "warning"}>
                      {examClosed ? "已结束" : examInWindow ? "进行中" : "未开始"}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <Badge variant="primary" className="font-normal">
                      {exam.course.title}
                    </Badge>
                    <span>·</span>
                    <span>开考 {formatDate(exam.openAt)}</span>
                    <span>·</span>
                    <span>结束 {formatDate(exam.closeAt)}</span>
                    <span>·</span>
                    <span>时长 {exam.durationMin} 分钟</span>
                    <span>·</span>
                    <span>{totalQuestions} 题 · 共 {exam.totalScore} 分</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-muted/30 px-6 py-4">
                  <Countdown deadline={exam.closeAt.toISOString()} variant="big" label="整场考试" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 概览小卡 */}
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
                          s.tone === "warning"
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

          {/* 按班级分屏 */}
          {groups.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <Users className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">本课程没有关联班级</p>
                <p className="text-xs text-muted-foreground">请先在课程里勾选授课班级</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-5">
              {groups.map((g) => {
                const groupRows = g.rows.map((s) => {
                  const a = attemptByStudent.get(s.id) ?? null;
                  return { student: s, attempt: a };
                });
                const gInProgress = groupRows.filter((r) => r.attempt?.status === "IN_PROGRESS").length;
                const gSubmitted = groupRows.filter(
                  (r) => r.attempt?.status && r.attempt.status !== "IN_PROGRESS",
                ).length;
                return (
                  <Card key={g.classId}>
                    <CardContent className="p-0">
                      <div className="flex items-center justify-between border-b border-border px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                            <Users className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold">
                              {g.gradeName} · {g.className}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              <span className="num">{g.rows.length}</span> 人 · 进行中 <span className="num">{gInProgress}</span> · 已交卷 <span className="num">{gSubmitted}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                              <th className="px-6 py-2.5">学号</th>
                              <th className="px-6 py-2.5">姓名</th>
                              <th className="px-6 py-2.5">状态</th>
                              <th className="px-6 py-2.5">开始 / 剩余</th>
                              <th className="px-6 py-2.5">已答题</th>
                              <th className="px-6 py-2.5">自动判分</th>
                              <th className="w-10"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {groupRows.map(({ student, attempt }) => {
                              if (!attempt) {
                                return (
                                  <tr key={student.id} className="text-muted-foreground">
                                    <td className="px-6 py-3 num">{student.studentNo}</td>
                                    <td className="px-6 py-3">{student.name}</td>
                                    <td className="px-6 py-3">
                                      <Badge variant="default">未开始</Badge>
                                    </td>
                                    <td className="px-6 py-3">—</td>
                                    <td className="px-6 py-3">—</td>
                                    <td className="px-6 py-3">—</td>
                                    <td className="px-2 py-3"></td>
                                  </tr>
                                );
                              }
                              const meta = STATUS_LABELS[attempt.status];
                              const isLive = attempt.status === "IN_PROGRESS";
                              return (
                                <tr key={student.id} className="group transition-colors hover:bg-muted/30">
                                  <td className="px-6 py-3 num text-muted-foreground">{student.studentNo}</td>
                                  <td className="px-6 py-3 font-medium">{student.name}</td>
                                  <td className="px-6 py-3">
                                    <Badge variant={meta.tone}>{meta.label}</Badge>
                                  </td>
                                  <td className="px-6 py-3">
                                    {isLive ? (
                                      <div className="flex flex-col gap-0.5">
                                        <span className="text-xs text-muted-foreground num">
                                          {formatDate(attempt.startedAt)}
                                        </span>
                                        <Countdown deadline={attempt.deadlineAt.toISOString()} />
                                      </div>
                                    ) : attempt.submittedAt ? (
                                      <span className="text-xs text-muted-foreground num">
                                        {formatDate(attempt.submittedAt)}
                                      </span>
                                    ) : (
                                      <span className="text-xs text-muted-foreground num">
                                        {formatDate(attempt.startedAt)}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-6 py-3 num text-muted-foreground">
                                    <span className="font-medium text-foreground">{attempt._count.answers}</span>
                                    <span className="text-subtle-foreground"> / {totalQuestions}</span>
                                  </td>
                                  <td className="px-6 py-3 num">
                                    {attempt.autoScore != null ? (
                                      <span
                                        className={
                                          attempt.autoScore >= exam.totalScore * 0.8
                                            ? "text-success"
                                            : attempt.autoScore >= exam.totalScore * 0.6
                                              ? "text-foreground"
                                              : "text-danger"
                                        }
                                      >
                                        {attempt.autoScore}
                                        <span className="text-subtle-foreground"> / {exam.totalScore}</span>
                                      </span>
                                    ) : (
                                      <span className="text-subtle-foreground">—</span>
                                    )}
                                  </td>
                                  <td className="px-2 py-3">
                                    <Link
                                      href={`/t/exams/${exam.id}/grade/${attempt.id}`}
                                      className="inline-flex"
                                    >
                                      <ChevronRight className="h-4 w-4 text-subtle-foreground transition-colors group-hover:text-primary" />
                                    </Link>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* 隐藏 case 提示 */}
          <div className="rounded-xl border border-info/30 bg-info-subtle/40 p-3 text-xs text-info">
            <Clock className="mr-1 inline h-3 w-3" />
            倒计时每秒刷新。超过 5 分钟变红，超时变灰。学生剩余时间以 attempt.deadlineAt 为准。
          </div>
        </div>
      </main>
    </>
  );
}