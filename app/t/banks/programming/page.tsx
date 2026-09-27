import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Topbar } from "@/components/shell/topbar";
import { relativeTime } from "@/lib/utils";
import { Code, Plus, Tag, FileText, Sparkles } from "lucide-react";
import { PreviewLink, EditLink } from "@/components/question-preview";
import type { Difficulty, Prisma } from "@prisma/client";

export const metadata = { title: "编程题公共库" };

const DIFFICULTY_LABELS: Record<
  Difficulty,
  { label: string; tone: "success" | "warning" | "danger" }
> = {
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
  others: "他人创建",
} as const;
type SourceFilter = keyof typeof SOURCE_LABELS;

const PAGE_SIZE = 20;

export default async function PublicProgrammingPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; difficulty?: string; tag?: string; page?: string }>;
}) {
  const session = await auth();
  const userId = session!.user.id;
  const isAdmin = session!.user.role === "ADMIN";
  const sp = await searchParams;

  const source: SourceFilter = sp.source === "mine" || sp.source === "others" ? sp.source : "all";
  const difficultyFilter: Difficulty | "" =
    sp.difficulty === "EASY" || sp.difficulty === "MEDIUM" || sp.difficulty === "HARD"
      ? sp.difficulty
      : "";
  const tagFilter = sp.tag?.trim() ?? "";
  const page = Math.max(1, Number(sp.page) || 1);

  // 公共库 = 所有编程题共享；按 source 筛选作者范围
  const where: Prisma.ProblemWhereInput = (() => {
    if (source === "mine") return { authorId: userId };
    if (source === "others") return { NOT: { authorId: userId } };
    return {};
  })();

  const problemFilters: Prisma.ProblemWhereInput = {
    ...where,
    ...(difficultyFilter ? { difficulty: difficultyFilter } : {}),
    ...(tagFilter ? { tags: { has: tagFilter } } : {}),
  };

  const [total, problems, tagRows] = await Promise.all([
    prisma.problem.count({
      where: problemFilters,
    }),
    prisma.problem.findMany({
      where: problemFilters,
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
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.problem.findMany({ select: { tags: true } }),
  ]);

  const availableTags = Array.from(
    new Set(tagRows.flatMap((problem) => problem.tags).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, "zh-CN"));

  const [mineCount, totalRefCount] = await Promise.all([
    prisma.problem.count({ where: { authorId: userId } }),
    prisma.assignmentProblem.count(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const baseNo = (page - 1) * PAGE_SIZE;

  const stats = [
    { icon: Code, label: "公共编程题", num: total },
    { icon: Sparkles, label: "我创建的", num: mineCount },
    { icon: FileText, label: "全站被引用", num: totalRefCount, accent: true },
  ];

  const sourceTabs: { key: SourceFilter; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "mine", label: "我创建的" },
    { key: "others", label: "他人创建" },
  ];

  function pageHref(p: number) {
    const qs = new URLSearchParams();
    if (source !== "all") qs.set("source", source);
    if (difficultyFilter) qs.set("difficulty", difficultyFilter);
    if (tagFilter) qs.set("tag", tagFilter);
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return `/t/banks/programming${s ? `?${s}` : ""}`;
  }

  return (
    <>
      <Topbar crumbs={[{ label: "题库", href: "/t/banks/programming" }, { label: "编程题" }]} />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">编程题公共库</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                所有编程题共享。你只能编辑自己创建的；管理员可编辑全部。
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

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
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
                    <div className="num mt-3 text-3xl font-bold tracking-tight">{s.num}</div>
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
                if (tagFilter) qs.set("tag", tagFilter);
                const href = `/t/banks/programming${qs.toString() ? `?${qs}` : ""}`;
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
              {(() => {
                const qs = new URLSearchParams();
                if (source !== "all") qs.set("source", source);
                if (tagFilter) qs.set("tag", tagFilter);
                return (
                  <Link
                    href={`/t/banks/programming${qs.toString() ? `?${qs}` : ""}`}
                    className={`rounded-md px-2 py-1 text-xs ${
                      !difficultyFilter
                        ? "bg-primary-subtle font-medium text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    全部
                  </Link>
                );
              })()}
              {(["EASY", "MEDIUM", "HARD"] as const).map((d) => {
                const active = difficultyFilter === d;
                const qs = new URLSearchParams();
                if (source !== "all") qs.set("source", source);
                qs.set("difficulty", d);
                if (tagFilter) qs.set("tag", tagFilter);
                return (
                  <Link
                    key={d}
                    href={`/t/banks/programming?${qs}`}
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

            <form
              action="/t/banks/programming"
              method="get"
              className="flex items-center gap-2 border-l border-border pl-3"
            >
              {source !== "all" && <input type="hidden" name="source" value={source} />}
              {difficultyFilter && (
                <input type="hidden" name="difficulty" value={difficultyFilter} />
              )}
              <label
                htmlFor="programming-tag-filter"
                className="flex items-center gap-1 text-xs text-muted-foreground"
              >
                <Tag className="h-3.5 w-3.5" />
                标签：
              </label>
              <select
                id="programming-tag-filter"
                name="tag"
                defaultValue={tagFilter}
                className="h-8 min-w-32 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="">全部标签</option>
                {availableTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
              >
                筛选
              </button>
            </form>
          </div>

          {problems.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Code className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">没有匹配的编程题</p>
                  <p className="mt-1 text-xs text-muted-foreground">切换其他过滤条件或新建一份</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                      <th className="w-16 px-6 py-3 text-right">编号</th>
                      <th className="px-6 py-3">标题</th>
                      <th className="px-6 py-3">难度</th>
                      <th className="px-6 py-3">标签</th>
                      <th className="px-6 py-3">作者</th>
                      <th className="px-6 py-3 text-right">用例</th>
                      <th className="px-6 py-3 text-right">被引用</th>
                      <th className="px-6 py-3">最后编辑</th>
                      <th className="w-28 px-6 py-3 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {problems.map((p, i) => {
                      const diff = DIFFICULTY_LABELS[p.difficulty];
                      const stars = "★".repeat(DIFFICULTY_STARS[p.difficulty]);
                      const isMine = p.author.id === userId;
                      const totalRefs = p._count.assignmentProblems + p._count.questions;
                      return (
                        <tr key={p.id} className="group transition-colors hover:bg-muted/30">
                          <td className="num px-6 py-3.5 text-right font-mono text-xs text-subtle-foreground">
                            #{(baseNo + i + 1).toString().padStart(3, "0")}
                          </td>
                          <td className="px-6 py-3.5">
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/t/problems/${p.id}`}
                                className="font-medium text-foreground hover:text-primary"
                              >
                                {p.title}
                              </Link>
                              {isMine ? (
                                <Badge variant="primary" className="font-normal">
                                  我的
                                </Badge>
                              ) : (
                                <Badge variant="default" className="font-normal">
                                  {p.author.name}
                                </Badge>
                              )}
                              {!isMine && (
                                <span className="text-[11px] text-subtle-foreground">· 只读</span>
                              )}
                            </div>
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
                          <td className="px-6 py-3.5 text-xs text-muted-foreground">
                            {p.author.name}
                          </td>
                          <td className="num px-6 py-3.5 text-right text-muted-foreground">
                            {p._count.testCases}
                          </td>
                          <td className="num px-6 py-3.5 text-right">
                            {totalRefs > 0 ? (
                              <span className="font-medium text-foreground">{totalRefs}</span>
                            ) : (
                              <span className="text-subtle-foreground">0</span>
                            )}
                          </td>
                          <td className="num px-6 py-3.5 text-xs text-muted-foreground">
                            {relativeTime(p.updatedAt)}
                          </td>
                          <td className="px-6 py-3.5 text-right">
                            <div className="inline-flex items-center gap-0.5">
                              <PreviewLink id={p.id} />
                              {(isMine || isAdmin) && (
                                <EditLink href={`/t/problems/${p.id}`} title="编辑题目" />
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-xs">
              <span className="num text-muted-foreground">
                第 {page} / {totalPages} 页 · 共 {total} 题
              </span>
              <div className="flex items-center gap-1">
                {page > 1 && (
                  <Link
                    href={pageHref(page - 1)}
                    className="rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    上一页
                  </Link>
                )}
                {page < totalPages && (
                  <Link
                    href={pageHref(page + 1)}
                    className="rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    下一页
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
