import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Topbar } from "@/components/shell/topbar";
import { relativeTime } from "@/lib/utils";
import { Code, CheckCircle2, Clock, ChevronRight, Filter, Search } from "lucide-react";
import type { Difficulty, JudgeStatus } from "@prisma/client";

export const metadata = { title: "题库练习" };

const DIFFICULTY_LABELS: Record<
  Difficulty,
  { label: string; tone: "success" | "warning" | "danger" }
> = {
  EASY: { label: "入门", tone: "success" },
  MEDIUM: { label: "中等", tone: "warning" },
  HARD: { label: "进阶", tone: "danger" },
};

export default async function StudentProblemsPage({
  searchParams,
}: {
  searchParams: Promise<{ difficulty?: string; q?: string }>;
}) {
  // 学生独立题库暂时下线；保留实现，后续可直接恢复入口。
  if (process.env.ENABLE_STUDENT_PROBLEM_LIBRARY !== "true") redirect("/dashboard");

  const session = await auth();
  const userId = session!.user.id;
  const sp = await searchParams;

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { classId: true },
  });
  if (!me?.classId) redirect("/dashboard");

  const difficulty =
    sp.difficulty === "EASY" || sp.difficulty === "MEDIUM" || sp.difficulty === "HARD"
      ? sp.difficulty
      : "";
  const query = sp.q?.trim() ?? "";

  // 公开题 + 通过 CourseClass 关联的作业里出现过的题
  // 1) 我能看到的题：
  const accessibleProblems = await prisma.problem.findMany({
    where: {
      OR: [
        { isPublic: true },
        {
          isPublic: false,
          assignmentProblems: {
            some: {
              assignment: {
                publishedAt: { not: null },
                course: { classes: { some: { classId: me.classId } } },
              },
            },
          },
        },
      ],
      ...(difficulty ? { difficulty } : {}),
      ...(query ? { title: { contains: query, mode: "insensitive" } } : {}),
    },
    orderBy: [{ updatedAt: "desc" }],
    include: {
      _count: { select: { testCases: true } },
    },
    take: 200,
  });

  // 2) 我的历史最佳（按 problemId 分组取最高分或已通过）
  const mySubmissions = await prisma.submission.findMany({
    where: {
      userId,
      contextType: "PRACTICE",
      problemId: { in: accessibleProblems.map((p) => p.id) },
    },
    orderBy: { createdAt: "desc" },
    select: {
      problemId: true,
      status: true,
      score: true,
      totalCount: true,
      passedCount: true,
      createdAt: true,
    },
  });

  type MyStat = {
    bestStatus: JudgeStatus | null;
    bestScore: number;
    lastAt: Date;
    attempts: number;
    hasAccepted: boolean;
  };
  const myStatByProblem = new Map<string, MyStat>();
  for (const s of mySubmissions) {
    const cur = myStatByProblem.get(s.problemId);
    if (!cur) {
      myStatByProblem.set(s.problemId, {
        bestStatus: s.status,
        bestScore: s.score,
        lastAt: s.createdAt,
        attempts: 1,
        hasAccepted: s.status === "ACCEPTED",
      });
      continue;
    }
    cur.attempts++;
    cur.lastAt = s.createdAt;
    if (s.status === "ACCEPTED") cur.hasAccepted = true;
    if (s.status === "ACCEPTED" || cur.bestStatus !== "ACCEPTED") {
      if (s.status === "ACCEPTED" || (cur.bestStatus && cur.bestStatus !== "ACCEPTED")) {
        // 优先 ACCEPTED
      }
      if (s.score > cur.bestScore) cur.bestScore = s.score;
    }
  }

  // 统计：可练习数 / 已通过 / 尝试中
  const totalAccessible = accessibleProblems.length;
  const acceptedCount = [...myStatByProblem.values()].filter((s) => s.hasAccepted).length;
  const attemptedCount = [...myStatByProblem.values()].filter((s) => s.attempts > 0).length;

  return (
    <>
      <Topbar crumbs={[{ label: "题库练习" }]} />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">题库练习</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              公开题库 + 教师发布的作业相关题。独立练习，不计入任何作业。
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <span className="text-sm text-muted-foreground">可练习</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                    <Code className="h-4 w-4" />
                  </div>
                </div>
                <div className="num mt-3 text-3xl font-bold tracking-tight">{totalAccessible}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <span className="text-sm text-muted-foreground">已通过</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success-subtle text-success">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                </div>
                <div className="num mt-3 text-3xl font-bold tracking-tight">{acceptedCount}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <span className="text-sm text-muted-foreground">尝试过</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning-subtle text-warning">
                    <Clock className="h-4 w-4" />
                  </div>
                </div>
                <div className="num mt-3 text-3xl font-bold tracking-tight">{attemptedCount}</div>
              </CardContent>
            </Card>
          </div>

          {/* 过滤条 */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">难度：</span>
              <Link
                href={query ? `/problems?q=${encodeURIComponent(query)}` : "/problems"}
                className={`rounded-md px-2 py-1 text-xs ${
                  !difficulty
                    ? "bg-primary-subtle font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                全部
              </Link>
              {(["EASY", "MEDIUM", "HARD"] as const).map((d) => {
                const active = difficulty === d;
                const qs = new URLSearchParams();
                qs.set("difficulty", d);
                if (query) qs.set("q", query);
                return (
                  <Link
                    key={d}
                    href={`/problems?${qs}`}
                    className={`rounded-md px-2 py-1 text-xs ${
                      active
                        ? "bg-primary-subtle font-medium text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {DIFFICULTY_LABELS[d].label}
                  </Link>
                );
              })}
            </div>
            <form className="ml-auto flex items-center gap-2" action="/problems">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle-foreground" />
                <input
                  name="q"
                  defaultValue={query}
                  placeholder="搜索题目…"
                  className="h-8 w-52 rounded-md border border-border bg-card pl-9 pr-3 text-xs focus-visible:border-primary focus-visible:outline-none"
                />
              </div>
              {difficulty && <input type="hidden" name="difficulty" value={difficulty} />}
            </form>
          </div>

          {accessibleProblems.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Code className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {query || difficulty ? "没有匹配的题目" : "暂无可练习的题目"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {query || difficulty
                      ? "试试调整筛选条件，或清除搜索"
                      : "教师发布作业后会在这里出现相关编程题"}
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
                      <th className="px-6 py-3">难度</th>
                      <th className="px-6 py-3">标签</th>
                      <th className="px-6 py-3">用例</th>
                      <th className="px-6 py-3">来源</th>
                      <th className="px-6 py-3">我的状态</th>
                      <th className="px-6 py-3">最近尝试</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {accessibleProblems.map((p) => {
                      const diff = DIFFICULTY_LABELS[p.difficulty];
                      const myStat = myStatByProblem.get(p.id);
                      return (
                        <tr key={p.id} className="group transition-colors hover:bg-muted/30">
                          <td className="px-6 py-3.5">
                            <Link
                              href={`/problems/${p.id}`}
                              className="font-medium text-foreground hover:text-primary"
                            >
                              {p.title}
                            </Link>
                          </td>
                          <td className="px-6 py-3.5">
                            <Badge variant={diff.tone} className="font-normal">
                              {diff.label}
                            </Badge>
                          </td>
                          <td className="px-6 py-3.5 text-xs text-muted-foreground">
                            {p.tags.length > 0 ? p.tags.slice(0, 4).join(" · ") : "—"}
                          </td>
                          <td className="num px-6 py-3.5 text-xs text-muted-foreground">
                            {p._count.testCases}
                          </td>
                          <td className="px-6 py-3.5">
                            {p.isPublic ? (
                              <Badge variant="default" className="font-normal">
                                公开库
                              </Badge>
                            ) : (
                              <Badge variant="primary" className="font-normal">
                                本班
                              </Badge>
                            )}
                          </td>
                          <td className="px-6 py-3.5">
                            {!myStat ? (
                              <span className="text-xs text-subtle-foreground">未尝试</span>
                            ) : myStat.hasAccepted ? (
                              <Badge variant="success" className="font-normal">
                                已通过
                              </Badge>
                            ) : (
                              <Badge variant="warning" className="font-normal">
                                {myStat.attempts} 次尝试
                              </Badge>
                            )}
                          </td>
                          <td className="num px-6 py-3.5 text-xs text-muted-foreground">
                            {myStat ? relativeTime(myStat.lastAt) : "—"}
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
