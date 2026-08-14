import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Topbar } from "@/components/shell/topbar";
import { relativeTime } from "@/lib/utils";
import { Code, Plus, Tag, BookMarked, FileText, Sparkles } from "lucide-react";
import type { Difficulty } from "@prisma/client";

export const metadata = { title: "我的编程题" };

const DIFFICULTY_LABELS: Record<Difficulty, { label: string; tone: "success" | "warning" | "danger" }> = {
  EASY: { label: "入门", tone: "success" },
  MEDIUM: { label: "中等", tone: "warning" },
  HARD: { label: "进阶", tone: "danger" },
};

const DIFFICULTY_STARS: Record<Difficulty, number> = {
  EASY: 1,
  MEDIUM: 2,
  HARD: 3,
};

const SOURCE_LABELS = {
  all: "全部",
  mine: "我创建的",
  public: "我共享到公共库",
  others: "引用公共库",
} as const;
type SourceFilter = keyof typeof SOURCE_LABELS;

export default async function TeacherProblemsPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; difficulty?: string }>;
}) {
  const session = await auth();
  const userId = session!.user.id;
  const sp = await searchParams;

  const source: SourceFilter =
    sp.source === "mine" || sp.source === "public" || sp.source === "others"
      ? sp.source
      : "all";
  const difficultyFilter =
    sp.difficulty === "EASY" || sp.difficulty === "MEDIUM" || sp.difficulty === "HARD"
      ? sp.difficulty
      : "";

  // 基础数据：我的编程题 + 公开库的其他人题（按需）
  const where = (() => {
    if (source === "mine") return { authorId: userId };
    if (source === "public") return { authorId: userId, isPublic: true };
    if (source === "others") return { isPublic: true, NOT: { authorId: userId } };
    return {
      OR: [{ authorId: userId }, { isPublic: true }],
    };
  })();

  const problems = await prisma.problem.findMany({
    where: {
      ...where,
      ...(difficultyFilter ? { difficulty: difficultyFilter } : {}),
    },
    include: {
      author: { select: { id: true, name: true } },
      _count: {
        select: {
          testCases: true,
          assignmentProblems: true,
          questions: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  // Stats
  const [mineCount, publicCount, totalRefCount, totalTestCaseCount] = await Promise.all([
    prisma.problem.count({ where: { authorId: userId } }),
    prisma.problem.count({ where: { authorId: userId, isPublic: true } }),
    prisma.assignmentProblem.count({
      where: { problem: { authorId: userId } },
    }),
    prisma.testCase.count({
      where: { problem: { authorId: userId } },
    }),
  ]);

  const stats = [
    { icon: Code, label: "我的编程题", num: mineCount },
    { icon: Sparkles, label: "共享到公共库", num: publicCount },
    { icon: FileText, label: "被作业引用", num: totalRefCount, accent: true },
    { icon: Tag, label: "测试用例", num: totalTestCaseCount },
  ];

  const sourceTabs: { key: SourceFilter; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "mine", label: "我创建的" },
    { key: "public", label: "我共享的" },
    { key: "others", label: "公共库" },
  ];

  return (
    <>
      <Topbar crumbs={[{ label: "我的编程题" }]} />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">我的编程题</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                创建编程题，挂载到作业前请先在「测试用例」用参考答案跑通。
                「共享到公共库」开启后其他教师可引用。
              </p>
            </div>
            <Link
              href="/t/problems/new"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
            >
              <Plus className="h-4 w-4" />
              新建编程题
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
                            ? "bg-accent-subtle text-accent"
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
              <span className="text-xs text-muted-foreground">来源：</span>
              {sourceTabs.map((t) => {
                const active = source === t.key;
                const qs = new URLSearchParams();
                if (t.key !== "all") qs.set("source", t.key);
                if (difficultyFilter) qs.set("difficulty", difficultyFilter);
                const href = `/t/problems${qs.toString() ? `?${qs}` : ""}`;
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

            <div className="flex items-center gap-2 border-l border-border pl-3">
              <span className="text-xs text-muted-foreground">难度：</span>
              <Link
                href={`/t/problems${source !== "all" ? `?source=${source}` : ""}`}
                className={`rounded-md px-2 py-1 text-xs ${
                  !difficultyFilter
                    ? "bg-primary-subtle font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                全部
              </Link>
              {(["EASY", "MEDIUM", "HARD"] as const).map((d) => {
                const active = difficultyFilter === d;
                const qs = new URLSearchParams();
                if (source !== "all") qs.set("source", source);
                qs.set("difficulty", d);
                return (
                  <Link
                    key={d}
                    href={`/t/problems?${qs}`}
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
          </div>

          {problems.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Code className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {source === "mine"
                      ? "还没有创建任何编程题"
                      : source === "public"
                        ? "还没有共享任何编程题"
                        : "没有匹配的编程题"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {source === "mine" || source === "public"
                      ? "点击右上角「新建编程题」开始创建"
                      : "切换其他过滤条件或新建一份"}
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
                      <th className="px-6 py-3">来源</th>
                      <th className="px-6 py-3 text-right">用例</th>
                      <th className="px-6 py-3 text-right">被引用</th>
                      <th className="px-6 py-3">最后编辑</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {problems.map((p) => {
                      const diff = DIFFICULTY_LABELS[p.difficulty];
                      const stars = "★".repeat(DIFFICULTY_STARS[p.difficulty]);
                      const isMine = p.author.id === userId;
                      const totalRefs = p._count.assignmentProblems + p._count.questions;
                      return (
                        <tr key={p.id} className="group transition-colors hover:bg-muted/30">
                          <td className="px-6 py-3.5">
                            <Link
                              href={`/t/problems/${p.id}`}
                              className="font-medium text-foreground hover:text-primary"
                            >
                              {p.title}
                            </Link>
                          </td>
                          <td className="px-6 py-3.5">
                            <div className="flex items-center gap-1.5">
                              <Badge variant={diff.tone} className="font-normal">
                                {diff.label}
                              </Badge>
                              <span className="text-[11px] text-warning">{stars}</span>
                            </div>
                          </td>
                          <td className="px-6 py-3.5">
                            {p.tags.length === 0 ? (
                              <span className="text-xs text-subtle-foreground">—</span>
                            ) : (
                              <div className="flex max-w-[200px] flex-wrap gap-1">
                                {p.tags.slice(0, 3).map((t) => (
                                  <span
                                    key={t}
                                    className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                                  >
                                    {t}
                                  </span>
                                ))}
                                {p.tags.length > 3 && (
                                  <span className="text-[11px] text-subtle-foreground">
                                    +{p.tags.length - 3}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-3.5">
                            {isMine ? (
                              p.isPublic ? (
                                <Badge variant="success" className="font-normal">
                                  共享
                                </Badge>
                              ) : (
                                <Badge variant="primary" className="font-normal">
                                  我的
                                </Badge>
                              )
                            ) : (
                              <Badge variant="default" className="font-normal">
                                公共库
                              </Badge>
                            )}
                          </td>
                          <td className="px-6 py-3.5 text-right num text-muted-foreground">
                            {p._count.testCases}
                          </td>
                          <td className="px-6 py-3.5 text-right num">
                            {totalRefs > 0 ? (
                              <span className="font-medium text-foreground">{totalRefs}</span>
                            ) : (
                              <span className="text-subtle-foreground">0</span>
                            )}
                          </td>
                          <td className="px-6 py-3.5 text-xs text-muted-foreground num">
                            {relativeTime(p.updatedAt)}
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