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
  FileText,
  CheckCircle2,
  AlertCircle,
  Users,
  Code,
  ClipboardCheck,
  Clock,
  BarChart3,
  Download,
} from "lucide-react";
import { ProblemsPanel } from "./_components/problems-panel";
import { AssignmentActions } from "./_components/assignment-actions";
import type { Difficulty, SubmissionStatus } from "@prisma/client";

export const metadata = { title: "作业详情" };

type Tab = "overview" | "problems" | "submissions";

const DIFFICULTY_LABELS: Record<Difficulty, { label: string; tone: "success" | "warning" | "danger" }> = {
  EASY: { label: "入门", tone: "success" },
  MEDIUM: { label: "中等", tone: "warning" },
  HARD: { label: "进阶", tone: "danger" },
};

const STATUS_LABELS: Record<SubmissionStatus, { label: string; tone: "default" | "warning" | "success" | "accent" }> = {
  DRAFT: { label: "草稿", tone: "default" },
  SUBMITTED: { label: "已提交", tone: "warning" },
  GRADED: { label: "已批改", tone: "success" },
  RETURNED: { label: "已退回", tone: "accent" },
};

export default async function TeacherAssignmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await auth();
  const userId = session!.user.id;

  // 权限：必须是该课程的主讲/助教
  const assignment = await prisma.assignment.findUnique({
    where: { id },
    include: {
      course: {
        select: {
          id: true,
          title: true,
          teachers: {
            where: { teacherId: userId },
            select: { role: true },
          },
        },
      },
    },
  });
  if (!assignment) notFound();

  const myRole = assignment.course.teachers[0]?.role;
  if (!myRole || (myRole !== "OWNER" && myRole !== "ASSISTANT")) {
    redirect("/t/assignments?error=forbidden");
  }
  const isOwner = myRole === "OWNER";

  const activeTab: Tab =
    sp.tab === "problems" ? "problems" : sp.tab === "submissions" ? "submissions" : "overview";

  const now = new Date();
  const isDraft = !assignment.publishedAt;
  const isOverdue = !isDraft && assignment.dueAt < now;

  // ========== 题目（共享给 overview + problems tab） ==========
  const problems = await prisma.assignmentProblem.findMany({
    where: { assignmentId: id },
    orderBy: { order: "asc" },
    include: {
      problem: {
        select: {
          id: true,
          title: true,
          difficulty: true,
          tags: true,
          authorId: true,
          isPublic: true,
          timeLimitMs: true,
          memoryLimitMb: true,
          _count: { select: { testCases: true } },
        },
      },
    },
  });

  // 可添加的编程题（本人 or 公开，且不在本作业中）
  const usedProblemIds = new Set(problems.map((p) => p.problemId));
  const availableProblems = await prisma.problem.findMany({
    where: {
      id: { notIn: [...usedProblemIds] },
      OR: [{ authorId: userId }, { isPublic: true }],
    },
    select: { id: true, title: true, difficulty: true, isPublic: true },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  // ========== 提交数据 ==========
  // 概览统计
  const submissionStats = await prisma.assignmentSubmission.groupBy({
    by: ["status"],
    where: { assignmentId: id },
    _count: { _all: true },
  });
  const statusCounts: Record<SubmissionStatus, number> = {
    DRAFT: 0,
    SUBMITTED: 0,
    GRADED: 0,
    RETURNED: 0,
  };
  for (const s of submissionStats) statusCounts[s.status] = s._count._all;

  // 课程下所有学生（按班级）+ 他们的提交记录
  const courseClasses = await prisma.courseClass.findMany({
    where: { courseId: assignment.courseId },
    include: {
      class: {
        include: {
          grade: { select: { name: true } },
          students: {
            where: { status: "ACTIVE", role: "STUDENT" },
            select: { id: true, name: true, studentNo: true },
            orderBy: [{ studentNo: "asc" }],
          },
        },
      },
    },
  });

  const allStudents = courseClasses.flatMap((cc) =>
    cc.class.students.map((s) => ({
      id: s.id,
      name: s.name,
      studentNo: s.studentNo,
      className: cc.class.name,
      gradeName: cc.class.grade.name,
    })),
  );

  const submissions = await prisma.assignmentSubmission.findMany({
    where: {
      assignmentId: id,
      studentId: { in: allStudents.map((s) => s.id) },
    },
    select: {
      id: true,
      studentId: true,
      status: true,
      finalScore: true,
      submittedAt: true,
      gradedAt: true,
    },
  });
  const subByStudent = new Map(submissions.map((s) => [s.studentId, s]));

  // ========== 每题编程提交（用于明细 + CSV 导出） ==========
  // Submissions 表：contextType=ASSIGNMENT, contextId=AssignmentSubmission.id, problemId
  // 每个 (attempt, problem) 取最新一条
  const attemptSubIds = submissions.map((s) => s.id);
  const problemIds = problems.map((p) => p.problemId);

  const perProblemSubs =
    attemptSubIds.length > 0 && problemIds.length > 0
      ? await prisma.submission.findMany({
          where: {
            contextType: "ASSIGNMENT",
            contextId: { in: attemptSubIds },
            problemId: { in: problemIds },
          },
          orderBy: { createdAt: "desc" },
          select: {
            contextId: true,
            problemId: true,
            score: true,
            status: true,
          },
        })
      : [];
  const scoreByAttemptProblem = new Map<string, { score: number; status: string }>();
  for (const s of perProblemSubs) {
    const key = `${s.contextId}:${s.problemId}`;
    if (!scoreByAttemptProblem.has(key)) {
      scoreByAttemptProblem.set(key, { score: s.score, status: s.status });
    }
  }
  const problemsForTab = problems.map((p) => ({
    problemId: p.problemId,
    title: p.problem.title,
    score: p.score,
    order: p.order,
  }));

  // 进度率：已提交+已批改 / 学生总数
  const submittedCount = statusCounts.SUBMITTED + statusCounts.GRADED + statusCounts.RETURNED;
  const gradedFinalScores = submissions
    .filter((s) => s.finalScore != null)
    .map((s) => s.finalScore as number);
  const avgScore =
    gradedFinalScores.length > 0
      ? Math.round(gradedFinalScores.reduce((s, n) => s + n, 0) / gradedFinalScores.length)
      : null;

  const tabs: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "overview", label: "概览", icon: BarChart3 },
    { key: "problems", label: `题目（${problems.length}）`, icon: Code },
    { key: "submissions", label: `提交（${submittedCount}）`, icon: Users },
  ];

  return (
    <>
      <Topbar
        crumbs={[
          { label: "我的作业", href: "/t/assignments" },
          { label: assignment.title },
        ]}
      />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div>
            <Link
              href="/t/assignments"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-3 w-3" />
              返回我的作业
            </Link>
            <div className="mt-2 flex items-end justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-2xl font-semibold tracking-tight">{assignment.title}</h1>
                  {isDraft ? (
                    <Badge variant="default">草稿</Badge>
                  ) : isOverdue ? (
                    <Badge variant="default">已截止</Badge>
                  ) : (
                    <Badge variant="success">进行中</Badge>
                  )}
                  <Link
                    href={`/t/courses/${assignment.course.id}`}
                    className="text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    {assignment.course.title}
                  </Link>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    截止 <span className="num">{formatDate(assignment.dueAt)}</span>
                  </span>
                  <span>·</span>
                  <span>
                    {assignment.allowLate ? (
                      <span className="text-success">
                        允许迟交 · 扣 {assignment.latePenalty}%
                      </span>
                    ) : (
                      <span className="text-warning">不允许迟交</span>
                    )}
                  </span>
                  <span>·</span>
                  <span className="num">{assignment.totalScore} 分</span>
                  <span>·</span>
                  <span className="num">{allStudents.length} 名学生</span>
                </div>
                {assignment.description && (
                  <p className="mt-3 whitespace-pre-line rounded-lg border border-border bg-muted/40 p-3 text-sm text-foreground">
                    {assignment.description}
                  </p>
                )}
              </div>
              <AssignmentActions
                assignmentId={assignment.id}
                courseId={assignment.courseId}
                isDraft={isDraft}
                isOwner={isOwner}
                hasSubmissions={submittedCount > 0}
                canAddProblem={problems.length > 0 || !isDraft}
              />
            </div>
          </div>

          {/* Tab 导航 */}
          <div className="flex items-center gap-1 border-b border-border">
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = t.key === activeTab;
              return (
                <Link
                  key={t.key}
                  href={`/t/assignments/${assignment.id}?tab=${t.key}`}
                  className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition-colors ${
                    active
                      ? "border-primary font-medium text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </Link>
              );
            })}
          </div>

          {activeTab === "overview" && (
            <OverviewTab
              assignment={{
                totalScore: assignment.totalScore,
                allowLate: assignment.allowLate,
                latePenalty: assignment.latePenalty,
              }}
              problemsCount={problems.length}
              allStudents={allStudents}
              statusCounts={statusCounts}
              avgScore={avgScore}
              submittedCount={submittedCount}
            />
          )}

          {activeTab === "problems" && (
            <ProblemsPanel
              assignmentId={assignment.id}
              isDraft={isDraft}
              problems={problems.map((p) => ({
                id: p.problemId,
                title: p.problem.title,
                difficulty: p.problem.difficulty,
                tags: p.problem.tags,
                timeLimitMs: p.problem.timeLimitMs,
                memoryLimitMb: p.problem.memoryLimitMb,
                testCaseCount: p.problem._count.testCases,
                score: p.score,
                order: p.order,
              }))}
              available={availableProblems.map((p) => ({
                id: p.id,
                title: p.title,
                difficulty: p.difficulty,
                isPublic: p.isPublic,
              }))}
            />
          )}

          {activeTab === "submissions" && (
            <SubmissionsTab
              assignmentId={assignment.id}
              allStudents={allStudents}
              subByStudent={Object.fromEntries(
                submissions.map((s) => [
                  s.studentId,
                  {
                    id: s.id,
                    status: s.status,
                    finalScore: s.finalScore,
                    submittedAt: s.submittedAt,
                    gradedAt: s.gradedAt,
                  },
                ]),
              )}
              problems={problemsForTab}
              scoreByAttemptProblem={Object.fromEntries(
                [...scoreByAttemptProblem.entries()].map(([k, v]) => [k, v]),
              )}
              totalScore={assignment.totalScore}
              isPublished={!isDraft}
              dueAt={assignment.dueAt}
            />
          )}
        </div>
      </main>
    </>
  );
}

function OverviewTab({
  assignment,
  problemsCount,
  allStudents,
  statusCounts,
  avgScore,
  submittedCount,
}: {
  assignment: { totalScore: number; allowLate: boolean; latePenalty: number };
  problemsCount: number;
  allStudents: Array<{ className: string }>;
  statusCounts: Record<SubmissionStatus, number>;
  avgScore: number | null;
  submittedCount: number;
}) {
  const total = allStudents.length;
  const submittedRate = total > 0 ? Math.round((submittedCount / total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">题目数</div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-3xl font-bold tracking-tight num">{problemsCount}</span>
              <span className="text-sm text-muted-foreground">题</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">总分</div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-3xl font-bold tracking-tight num">{assignment.totalScore}</span>
              <span className="text-sm text-muted-foreground">分</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">提交率</div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-3xl font-bold tracking-tight num">{submittedRate}</span>
              <span className="text-sm text-muted-foreground">
                %（<span className="num">{submittedCount}</span>/<span className="num">{total}</span>）
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">平均分（已批改）</div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-3xl font-bold tracking-tight num">
                {avgScore ?? "—"}
              </span>
              {avgScore != null && (
                <span className="text-sm text-muted-foreground">分</span>
              )}
            </div>
            {avgScore == null && (
              <p className="mt-1 text-[11px] text-subtle-foreground">尚无已批改数据</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-6">
          <h2 className="text-base font-semibold">提交状态分布</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatusBox
              icon={FileText}
              label="草稿"
              count={statusCounts.DRAFT}
              tone="default"
            />
            <StatusBox
              icon={AlertCircle}
              label="已提交（待批改）"
              count={statusCounts.SUBMITTED}
              tone="warning"
              accent
            />
            <StatusBox
              icon={CheckCircle2}
              label="已批改"
              count={statusCounts.GRADED}
              tone="success"
            />
            <StatusBox
              icon={ClipboardCheck}
              label="已退回"
              count={statusCounts.RETURNED}
              tone="accent"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBox({
  icon: Icon,
  label,
  count,
  tone,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  tone: "default" | "warning" | "success" | "accent";
  accent?: boolean;
}) {
  const bgMap = {
    default: "bg-muted text-muted-foreground",
    warning: "bg-warning-subtle text-warning",
    success: "bg-success-subtle text-success",
    accent: "bg-accent-subtle text-accent",
  } as const;
  return (
    <div
      className={`rounded-lg border p-3 ${
        accent && count > 0 ? "border-warning/40" : "border-border"
      }`}
    >
      <div className="flex items-start justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className={`flex h-7 w-7 items-center justify-center rounded-md ${bgMap[tone]}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <div className="mt-2 text-2xl font-semibold num">{count}</div>
    </div>
  );
}

function SubmissionsTab({
  assignmentId,
  allStudents,
  subByStudent,
  problems,
  scoreByAttemptProblem,
  totalScore,
  isPublished,
  dueAt,
}: {
  assignmentId: string;
  allStudents: Array<{ id: string; name: string; studentNo: string | null; className: string; gradeName: string }>;
  subByStudent: Record<string, { id: string; status: SubmissionStatus; finalScore: number | null; submittedAt: Date | null; gradedAt: Date | null }>;
  problems: Array<{ problemId: string; title: string; score: number; order: number }>;
  scoreByAttemptProblem: Record<string, { score: number; status: string }>;
  totalScore: number;
  isPublished: boolean;
  dueAt: Date;
}) {
  // 按班级分组
  const byClass = new Map<string, typeof allStudents>();
  for (const s of allStudents) {
    const arr = byClass.get(s.className) ?? [];
    arr.push(s);
    byClass.set(s.className, arr);
  }

  if (allStudents.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <Users className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">本作业关联的课程尚未绑定任何班级</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {!isPublished && (
        <div className="rounded-xl border border-warning/40 bg-warning-subtle/40 p-4 text-xs text-warning">
          <AlertCircle className="mr-1.5 inline h-3.5 w-3.5" />
          作业尚未发布。学生看不到此作业，也无法提交。
        </div>
      )}

      {/* 操作行：导出 CSV */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          按班级展示所有学生的提交情况。带 <span className="font-mono text-warning">迟</span> 标记表示迟交。
        </p>
        <a
          href={`/api/assignments/${assignmentId}/submissions.csv`}
          download
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          <Download className="h-3.5 w-3.5" />
          导出 CSV
        </a>
      </div>

      {[...byClass.entries()].map(([className, students]) => {
        const submitted = students.filter((s) => subByStudent[s.id] != null).length;
        return (
          <Card key={className}>
            <CardContent className="p-0">
              <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-6 py-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">{className}</span>
                </div>
                <span className="num text-xs text-muted-foreground">
                  已交 <b className="text-foreground">{submitted}</b> / 共{" "}
                  <b className="text-foreground">{students.length}</b>
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-left text-xs font-medium text-muted-foreground">
                      <th className="px-3 py-2.5 whitespace-nowrap">学号</th>
                      <th className="px-3 py-2.5 whitespace-nowrap">姓名</th>
                      <th className="px-3 py-2.5 whitespace-nowrap">状态</th>
                      {problems.map((p) => (
                        <th
                          key={p.problemId}
                          className="px-2 py-2.5 text-center whitespace-nowrap"
                          title={`第${p.order + 1}题 · ${p.title}（满分 ${p.score}）`}
                        >
                          <div className="text-xs">第{p.order + 1}题</div>
                          <div className="num text-[11px] text-subtle-foreground">
                            /{p.score}
                          </div>
                        </th>
                      ))}
                      <th className="px-3 py-2.5 text-right whitespace-nowrap">总分</th>
                      <th className="px-3 py-2.5 whitespace-nowrap">提交时间</th>
                      <th className="px-3 py-2.5 whitespace-nowrap">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {students.map((s) => {
                      const sub = subByStudent[s.id];
                      const late =
                        sub?.submittedAt && sub.submittedAt > dueAt;
                      return (
                        <tr key={s.id} className="hover:bg-muted/20">
                          <td className="px-3 py-2.5 num font-mono text-xs text-muted-foreground whitespace-nowrap">
                            {s.studentNo ?? "—"}
                          </td>
                          <td className="px-3 py-2.5 font-medium text-foreground whitespace-nowrap">
                            {s.name}
                            {late && (
                              <span className="ml-1.5 inline-flex items-center rounded bg-warning-subtle px-1.5 py-0.5 text-[10px] font-medium text-warning">
                                迟
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {sub ? (
                              <Badge variant={STATUS_LABELS[sub.status].tone}>
                                {STATUS_LABELS[sub.status].label}
                              </Badge>
                            ) : (
                              <span className="text-xs text-subtle-foreground">未提交</span>
                            )}
                          </td>
                          {problems.map((p) => {
                            const cell = sub
                              ? scoreByAttemptProblem[`${sub.id}:${p.problemId}`]
                              : undefined;
                            const score = cell?.score;
                            const tone = scoreTone(score, p.score);
                            return (
                              <td
                                key={p.problemId}
                                className="px-2 py-2.5 text-center num text-xs whitespace-nowrap"
                              >
                                {score != null ? (
                                  <span
                                    className={
                                      tone === "success"
                                        ? "text-success font-medium"
                                        : tone === "warning"
                                          ? "text-warning"
                                          : tone === "danger"
                                            ? "text-danger"
                                            : "text-foreground"
                                    }
                                  >
                                    {score}
                                  </span>
                                ) : (
                                  <span className="text-subtle-foreground">—</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2.5 num text-right whitespace-nowrap">
                            {sub?.finalScore != null ? (
                              <span
                                className={
                                  sub.finalScore >= totalScore * 0.8
                                    ? "font-medium text-success"
                                    : sub.finalScore >= totalScore * 0.6
                                      ? "text-foreground"
                                      : "text-danger"
                                }
                              >
                                {sub.finalScore}
                                <span className="ml-0.5 text-xs text-muted-foreground">
                                  / {totalScore}
                                </span>
                              </span>
                            ) : (
                              <span className="text-subtle-foreground">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground num whitespace-nowrap">
                            {sub?.submittedAt
                              ? relativeTime(sub.submittedAt)
                              : "—"}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {sub ? (
                              <Link
                                href={`/t/assignments/${assignmentId}/grade`}
                                className="text-xs text-primary hover:underline"
                              >
                                批改
                              </Link>
                            ) : (
                              <span className="text-subtle-foreground">—</span>
                            )}
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
  );
}

/** 单题得分色阶：≥0.8 绿 / ≥0.5 普通 / <0.5 黄 / 满分警告红（0 分或极端低） */
function scoreTone(score: number | undefined, fullScore: number): "success" | "warning" | "danger" | "muted" {
  if (score == null) return "muted";
  if (fullScore <= 0) return "muted";
  const rate = score / fullScore;
  if (rate >= 0.8) return "success";
  if (rate >= 0.5) return "muted";
  if (rate >= 0.25) return "warning";
  return "danger";
}