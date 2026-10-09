import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Topbar } from "@/components/shell/topbar";
import { FileText, GraduationCap, Code, ChevronRight } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { JudgeStatus, SubmissionStatus, AttemptStatus } from "@prisma/client";

export const metadata = { title: "我的提交" };

type Tab = "all" | "practice" | "assignment" | "exam";

const JUDGE_LABELS: Record<JudgeStatus, { label: string; tone: "default" | "warning" | "success" | "danger" | "primary" }> = {
  PENDING: { label: "等待评测", tone: "default" },
  JUDGING: { label: "评测中", tone: "warning" },
  ACCEPTED: { label: "通过", tone: "success" },
  WRONG_ANSWER: { label: "答案错误", tone: "danger" },
  TLE: { label: "超时", tone: "warning" },
  MLE: { label: "超内存", tone: "warning" },
  RUNTIME_ERROR: { label: "运行错误", tone: "danger" },
  COMPILE_ERROR: { label: "编译错误", tone: "danger" },
  SYSTEM_ERROR: { label: "系统错误", tone: "danger" },
};

const ASSIGN_LABELS: Record<SubmissionStatus, { label: string; tone: "default" | "warning" | "success" | "danger" | "accent" }> = {
  DRAFT: { label: "草稿", tone: "default" },
  SUBMITTED: { label: "已提交", tone: "warning" },
  GRADED: { label: "已批改", tone: "success" },
  RETURNED: { label: "已退回", tone: "accent" },
};

const ATTEMPT_LABELS: Record<AttemptStatus, { label: string; tone: "default" | "warning" | "success" | "primary" }> = {
  IN_PROGRESS: { label: "进行中", tone: "warning" },
  SUBMITTED: { label: "已交卷", tone: "primary" },
  GRADING: { label: "批改中", tone: "warning" },
  GRADED: { label: "已批改", tone: "success" },
};

export default async function StudentSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const session = await auth();
  const userId = session!.user.id;
  const sp = await searchParams;

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { classId: true },
  });
  if (!me?.classId) redirect("/dashboard");

  const tab: Tab =
    sp.type === "practice" || sp.type === "assignment" || sp.type === "exam" ? sp.type : "all";

  // 三类提交并行拉取（按时间倒序，限 50）
  const [practiceSubs, assignmentSubs, examAttempts] = await Promise.all([
    prisma.submission.findMany({
      where: { userId, contextType: "PRACTICE" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        status: true,
        score: true,
        passedCount: true,
        totalCount: true,
        createdAt: true,
        problem: { select: { id: true, title: true } },
      },
    }),
    prisma.assignmentSubmission.findMany({
      where: { studentId: userId },
      orderBy: { submittedAt: "desc" },
      take: 50,
      select: {
        id: true,
        status: true,
        autoScore: true,
        manualScore: true,
        finalScore: true,
        submittedAt: true,
        gradedAt: true,
        assignment: {
          select: {
            id: true,
            title: true,
            totalScore: true,
            course: { select: { id: true, title: true } },
          },
        },
      },
    }),
    prisma.examAttempt.findMany({
      where: { studentId: userId, submittedAt: { not: null } },
      orderBy: { submittedAt: "desc" },
      take: 50,
      select: {
        id: true,
        examId: true,
        status: true,
        autoScore: true,
        manualScore: true,
        finalScore: true,
        submittedAt: true,
        exam: { select: { id: true, title: true, totalScore: true, course: { select: { id: true, title: true } } } },
      },
    }),
  ]);

  // tab 计数
  const counts = {
    all: practiceSubs.length + assignmentSubs.length + examAttempts.length,
    practice: practiceSubs.length,
    assignment: assignmentSubs.length,
    exam: examAttempts.length,
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "practice", label: "练习" },
    { key: "assignment", label: "作业" },
    { key: "exam", label: "考试" },
  ];

  const showPractice = tab === "all" || tab === "practice";
  const showAssignment = tab === "all" || tab === "assignment";
  const showExam = tab === "all" || tab === "exam";

  const totalShown =
    (showPractice ? practiceSubs.length : 0) +
    (showAssignment ? assignmentSubs.length : 0) +
    (showExam ? examAttempts.length : 0);

  return (
    <>
      <Topbar crumbs={[{ label: "我的提交" }]} />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">我的提交</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              聚合练习、作业、考试三类提交的评测与得分。
            </p>
          </div>

          {/* 过滤 tabs */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
            {tabs.map((t) => {
              const active = tab === t.key;
              const href = `/submissions${t.key !== "all" ? `?type=${t.key}` : ""}`;
              return (
                <Link
                  key={t.key}
                  href={href}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors ${
                    active
                      ? "bg-primary-subtle font-medium text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {t.label}
                  <span className="num text-[11px] text-subtle-foreground">{counts[t.key]}</span>
                </Link>
              );
            })}
          </div>

          {totalShown === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <FileText className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">暂无提交记录</p>
                <p className="text-xs text-muted-foreground">
                  练习、作业或考试提交后会出现在这里
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                      <th className="px-6 py-3">类型</th>
                      <th className="px-6 py-3">标题</th>
                      <th className="px-6 py-3">课程</th>
                      <th className="px-6 py-3">状态</th>
                      <th className="px-6 py-3 text-right">得分</th>
                      <th className="px-6 py-3">时间</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {showPractice &&
                      practiceSubs.map((s) => {
                        const meta = JUDGE_LABELS[s.status];
                        return (
                          <tr key={s.id} className="group transition-colors hover:bg-muted/30">
                            <td className="px-6 py-3.5">
                              <TypeBadge kind="practice" />
                            </td>
                            <td className="px-6 py-3.5 font-medium text-foreground">
                              {s.problem.title}
                            </td>
                            <td className="px-6 py-3.5 text-subtle-foreground">—</td>
                            <td className="px-6 py-3.5">
                              <Badge variant={meta.tone as "default" | "warning" | "success" | "danger" | "primary"}>
                                {meta.label}
                              </Badge>
                            </td>
                            <td className="px-6 py-3.5 text-right num text-foreground">
                              {s.status === "PENDING" || s.status === "JUDGING" ? (
                                <span className="text-subtle-foreground">—</span>
                              ) : (
                                <span className={s.score === 100 ? "text-success" : ""}>
                                  {s.passedCount}/{s.totalCount}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-3.5 text-xs text-muted-foreground num">
                              {formatDate(s.createdAt)}
                            </td>
                            <td className="px-2 py-3.5">
                              <ChevronRight className="h-4 w-4 text-subtle-foreground transition-colors group-hover:text-primary" />
                            </td>
                          </tr>
                        );
                      })}
                    {showAssignment &&
                      assignmentSubs.map((s) => {
                        const meta = ASSIGN_LABELS[s.status];
                        const score = s.finalScore ?? s.autoScore ?? null;
                        return (
                          <tr key={s.id} className="group transition-colors hover:bg-muted/30">
                            <td className="px-6 py-3.5">
                              <TypeBadge kind="assignment" />
                            </td>
                            <td className="px-6 py-3.5">
                              <Link
                                href={`/assignments/${s.assignment.id}`}
                                className="font-medium text-foreground hover:text-primary"
                              >
                                {s.assignment.title}
                              </Link>
                            </td>
                            <td className="px-6 py-3.5">
                              <Badge variant="primary" className="font-normal">
                                {s.assignment.course.title}
                              </Badge>
                            </td>
                            <td className="px-6 py-3.5">
                              <Badge variant={meta.tone as "default" | "warning" | "success" | "accent"}>
                                {meta.label}
                              </Badge>
                            </td>
                            <td className="px-6 py-3.5 text-right num">
                              {score != null ? (
                                <span
                                  className={
                                    score >= s.assignment.totalScore * 0.8
                                      ? "text-success"
                                      : score >= s.assignment.totalScore * 0.6
                                        ? "text-foreground"
                                        : "text-danger"
                                  }
                                >
                                  {score} / {s.assignment.totalScore}
                                </span>
                              ) : (
                                <span className="text-subtle-foreground">—</span>
                              )}
                            </td>
                            <td className="px-6 py-3.5 text-xs text-muted-foreground num">
                              {formatDate(s.gradedAt ?? s.submittedAt ?? new Date(0))}
                            </td>
                            <td className="px-2 py-3.5">
                              <ChevronRight className="h-4 w-4 text-subtle-foreground transition-colors group-hover:text-primary" />
                            </td>
                          </tr>
                        );
                      })}
                    {showExam &&
                      examAttempts.map((a) => {
                        const meta = ATTEMPT_LABELS[a.status];
                        const score = a.finalScore ?? a.autoScore ?? null;
                        return (
                          <tr key={a.id} className="group transition-colors hover:bg-muted/30">
                            <td className="px-6 py-3.5">
                              <TypeBadge kind="exam" />
                            </td>
                            <td className="px-6 py-3.5">
                              <Link
                                href={`/exams/${a.examId}/result`}
                                className="font-medium text-foreground hover:text-primary"
                              >
                                {a.exam.title}
                              </Link>
                            </td>
                            <td className="px-6 py-3.5">
                              <Badge variant="primary" className="font-normal">
                                {a.exam.course.title}
                              </Badge>
                            </td>
                            <td className="px-6 py-3.5">
                              <Badge variant={meta.tone as "default" | "warning" | "success" | "primary"}>
                                {meta.label}
                              </Badge>
                            </td>
                            <td className="px-6 py-3.5 text-right num">
                              {score != null ? (
                                <span
                                  className={
                                    score >= a.exam.totalScore * 0.8
                                      ? "text-success"
                                      : score >= a.exam.totalScore * 0.6
                                        ? "text-foreground"
                                        : "text-danger"
                                  }
                                >
                                  {score} / {a.exam.totalScore}
                                </span>
                              ) : (
                                <span className="text-subtle-foreground">—</span>
                              )}
                            </td>
                            <td className="px-6 py-3.5 text-xs text-muted-foreground num">
                              {formatDate(a.submittedAt!)}
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

function TypeBadge({ kind }: { kind: "practice" | "assignment" | "exam" }) {
  const map = {
    practice: { icon: Code, label: "练习", tone: "bg-accent-subtle text-accent" },
    assignment: { icon: FileText, label: "作业", tone: "bg-warning-subtle text-warning" },
    exam: { icon: GraduationCap, label: "考试", tone: "bg-primary-subtle text-primary" },
  } as const;
  const m = map[kind];
  const Icon = m.icon;
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium ${m.tone}`}>
      <Icon className="h-3 w-3" />
      {m.label}
    </div>
  );
}
