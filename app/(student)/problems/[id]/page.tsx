import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Topbar } from "@/components/shell/topbar";
import { relativeTime } from "@/lib/utils";
import {
  ChevronLeft,
  Code,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  History,
} from "lucide-react";
import type { Difficulty, JudgeStatus } from "@prisma/client";
import { PracticeSolver } from "./_components/practice-solver";

export const metadata = { title: "编程题练习" };

const DIFFICULTY_LABELS: Record<Difficulty, { label: string; tone: "success" | "warning" | "danger" }> = {
  EASY: { label: "入门", tone: "success" },
  MEDIUM: { label: "中等", tone: "warning" },
  HARD: { label: "进阶", tone: "danger" },
};

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "default"> = {
  ACCEPTED: "success",
  WRONG_ANSWER: "warning",
  TLE: "danger",
  MLE: "danger",
  RUNTIME_ERROR: "danger",
  COMPILE_ERROR: "danger",
  SYSTEM_ERROR: "danger",
  PENDING: "default",
  JUDGING: "default",
};

const STATUS_LABEL: Record<string, string> = {
  ACCEPTED: "通过",
  WRONG_ANSWER: "答案错误",
  TLE: "运行超时",
  MLE: "内存超限",
  RUNTIME_ERROR: "运行错误",
  COMPILE_ERROR: "编译错误",
  SYSTEM_ERROR: "系统异常",
};

export default async function StudentProblemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userId = session!.user.id;

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { classId: true },
  });
  if (!me?.classId) redirect("/dashboard");

  const problem = await prisma.problem.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, name: true } },
      testCases: {
        orderBy: { order: "asc" },
        select: { id: true, input: true, expected: true, isSample: true },
      },
    },
  });
  if (!problem) notFound();

  // 访问控制：公开 OR 通过作业带入
  if (!problem.isPublic) {
    const accessible = await prisma.assignmentProblem.count({
      where: {
        problemId: id,
        assignment: {
          publishedAt: { not: null },
          course: { classes: { some: { classId: me.classId } } },
        },
      },
    });
    if (accessible === 0) notFound();
  }

  const sampleCases = problem.testCases.filter((tc) => tc.isSample);
  const maxScore = await prisma.testCase
    .aggregate({
      where: { problemId: id },
      _sum: { score: true },
    })
    .then((r) => r._sum.score ?? 0);

  // 我的历史
  const history = await prisma.submission.findMany({
    where: {
      userId,
      problemId: id,
      contextType: "PRACTICE",
    },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: {
      id: true,
      status: true,
      passedCount: true,
      totalCount: true,
      score: true,
      maxTimeMs: true,
      createdAt: true,
      code: true,
    },
  });

  const lastSubmission = history[0];
  const lastCode = lastSubmission?.code ?? null;

  // 累计统计
  const stats = await prisma.submission.groupBy({
    by: ["status"],
    where: { userId, problemId: id, contextType: "PRACTICE" },
    _count: { _all: true },
  });
  let attemptsCount = 0;
  let acceptCount = 0;
  for (const s of stats) {
    attemptsCount += s._count._all;
    if (s.status === "ACCEPTED") acceptCount = s._count._all;
  }

  // 渲染 lastResult（如有）
  const lastResult = lastSubmission
    ? {
        submissionId: lastSubmission.id,
        status: lastSubmission.status as JudgeStatus,
        passedCount: lastSubmission.passedCount,
        totalCount: lastSubmission.totalCount,
        score: lastSubmission.score,
        timeMs: lastSubmission.maxTimeMs ?? 0,
        cases: [] as Array<{
          order: number;
          isSample: boolean;
          status: string;
          timeMs: number;
          actualOutput?: string;
          errorMsg?: string;
        }>,
      }
    : null;

  return (
    <>
      <Topbar
        crumbs={[
          { label: "题库练习", href: "/problems" },
          { label: problem.title },
        ]}
      />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-6">
          <div>
            <Link
              href="/problems"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-3 w-3" />
              返回题库练习
            </Link>
            <div className="mt-2 flex items-end justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight">{problem.title}</h1>
                  <Badge
                    variant={DIFFICULTY_LABELS[problem.difficulty].tone}
                    className="font-normal"
                  >
                    {DIFFICULTY_LABELS[problem.difficulty].label}
                  </Badge>
                  {problem.isPublic ? (
                    <Badge variant="default" className="font-normal">
                      公开库
                    </Badge>
                  ) : (
                    <Badge variant="primary" className="font-normal">
                      班级题
                    </Badge>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="num">{problem.testCases.length} 个用例</span>
                  <span>·</span>
                  <span className="num">
                    {problem.timeLimitMs}ms / {problem.memoryLimitMb}MB
                  </span>
                  {problem.tags.length > 0 && (
                    <>
                      <span>·</span>
                      <span>{problem.tags.slice(0, 4).join(" · ")}</span>
                    </>
                  )}
                  <span>·</span>
                  <span>作者：{problem.author.name}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            {/* 主区 */}
            <div className="space-y-4">
              {problem.description.trim() && (
                <Card>
                  <CardContent className="p-6">
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                      <Code className="h-4 w-4 text-primary" />
                      题目描述
                    </div>
                    <div className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                      {problem.description}
                    </div>
                  </CardContent>
                </Card>
              )}

              {sampleCases.length > 0 && (
                <Card>
                  <CardContent className="p-6">
                    <div className="mb-3 text-sm font-semibold">样例输入输出</div>
                    <div className="space-y-3">
                      {sampleCases.map((s, i) => (
                        <div
                          key={i}
                          className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-2"
                        >
                          <div>
                            <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                              输入 #{i + 1}
                            </div>
                            <pre className="overflow-x-auto whitespace-pre rounded bg-muted/60 px-2.5 py-2 font-mono text-xs text-foreground">
                              {s.input || "（空）"}
                            </pre>
                          </div>
                          <div>
                            <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                              期望输出 #{i + 1}
                            </div>
                            <pre className="overflow-x-auto whitespace-pre rounded bg-muted/60 px-2.5 py-2 font-mono text-xs text-foreground">
                              {s.expected || "（空）"}
                            </pre>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <PracticeSolver
                problemId={problem.id}
                starterCode={problem.starterCode}
                lastCode={lastCode}
                lastResult={lastResult}
                maxScore={maxScore}
              />
            </div>

            {/* 侧栏 */}
            <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
              <Card>
                <CardContent className="p-5">
                  <div className="mb-3 text-sm font-semibold">我的统计</div>
                  <div className="space-y-2.5">
                    <StatRow
                      label="总尝试次数"
                      value={attemptsCount.toString()}
                      tone="default"
                    />
                    <StatRow
                      label="通过次数"
                      value={acceptCount.toString()}
                      tone={acceptCount > 0 ? "success" : "default"}
                    />
                    <StatRow
                      label="当前最佳"
                      value={
                        acceptCount > 0
                          ? `${lastSubmission!.score} / ${maxScore}`
                          : attemptsCount > 0
                            ? `未通过`
                            : "未尝试"
                      }
                      tone={
                        acceptCount > 0
                          ? "success"
                          : attemptsCount > 0
                            ? "warning"
                            : "muted"
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-semibold">提交历史</span>
                    <History className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  {history.length === 0 ? (
                    <p className="py-6 text-center text-xs text-muted-foreground">还没有提交记录</p>
                  ) : (
                    <ul className="space-y-2">
                      {history.map((h) => {
                        const tone = STATUS_TONE[h.status] ?? "default";
                        return (
                          <li
                            key={h.id}
                            className={`flex items-center gap-2 rounded-md border p-2 text-xs ${
                              h.status === "ACCEPTED"
                                ? "border-success/30 bg-success-subtle/20"
                                : "border-border bg-card"
                            }`}
                          >
                            {tone === "success" ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                            ) : tone === "warning" ? (
                              <XCircle className="h-3.5 w-3.5 text-warning" />
                            ) : (
                              <AlertCircle className="h-3.5 w-3.5 text-danger" />
                            )}
                            <Badge variant={tone}>
                              {STATUS_LABEL[h.status] ?? h.status}
                            </Badge>
                            <span className="num text-muted-foreground">
                              {h.passedCount}/{h.totalCount}
                            </span>
                            {h.maxTimeMs != null && (
                              <span className="num ml-auto text-muted-foreground">
                                <Clock className="mr-0.5 inline h-3 w-3" />
                                {h.maxTimeMs}ms
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5">
                  <div className="mb-2 text-xs font-medium text-muted-foreground">限制</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
                      <div className="text-muted-foreground">单用例时间</div>
                      <div className="num mt-0.5 font-medium text-foreground">
                        {problem.timeLimitMs}ms
                      </div>
                    </div>
                    <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
                      <div className="text-muted-foreground">内存上限</div>
                      <div className="num mt-0.5 font-medium text-foreground">
                        {problem.memoryLimitMb}MB
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

function StatRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "default" | "success" | "warning" | "muted";
}) {
  const colorMap: Record<string, string> = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    muted: "text-subtle-foreground",
  };
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`num text-sm font-medium ${colorMap[tone]}`}>{value}</span>
    </div>
  );
}
