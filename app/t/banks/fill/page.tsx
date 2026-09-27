import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Topbar } from "@/components/shell/topbar";
import { relativeTime } from "@/lib/utils";
import { SquarePen, Sparkles, FileText, Library } from "lucide-react";
import { PreviewLink, EditLink } from "@/components/question-preview";
import type { Difficulty, QuestionType } from "@prisma/client";

export const metadata = { title: "填空题公共库" };

const DIFFICULTY_LABELS: Record<Difficulty, { label: string; tone: "success" | "warning" | "danger" }> = {
  EASY: { label: "入门", tone: "success" },
  MEDIUM: { label: "中等", tone: "warning" },
  HARD: { label: "进阶", tone: "danger" },
};

const SOURCE_LABELS = {
  all: "全部",
  mine: "我创建的",
  others: "他人创建",
} as const;
type SourceFilter = keyof typeof SOURCE_LABELS;

const PAGE_SIZE = 20;

export default async function PublicFillPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; difficulty?: string; page?: string }>;
}) {
  const session = await auth();
  const userId = session!.user.id;
  const isAdmin = session!.user.role === "ADMIN";
  const sp = await searchParams;

  const source: SourceFilter =
    sp.source === "mine" || sp.source === "others" ? sp.source : "all";
  const difficultyFilter =
    sp.difficulty === "EASY" || sp.difficulty === "MEDIUM" || sp.difficulty === "HARD"
      ? sp.difficulty
      : "";
  const page = Math.max(1, Number(sp.page) || 1);

  const where = (() => {
    if (source === "mine") return { bank: { ownerId: userId } };
    if (source === "others") return { bank: { NOT: { ownerId: userId } } };
    return {};
  })();

  const [total, questions] = await Promise.all([
    prisma.question.count({
      where: {
        type: "FILL_BLANK" as QuestionType,
        ...where,
        ...(difficultyFilter ? { difficulty: difficultyFilter } : {}),
      },
    }),
    prisma.question.findMany({
      where: {
        type: "FILL_BLANK" as QuestionType,
        ...where,
        ...(difficultyFilter ? { difficulty: difficultyFilter } : {}),
      },
      include: {
        bank: { select: { id: true, name: true, ownerId: true } },
        _count: { select: { examQuestions: true } },
      },
      orderBy: [{ id: "asc" }],
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
  ]);

  const [mineCount, totalRefCount] = await Promise.all([
    prisma.question.count({
      where: { type: "FILL_BLANK", bank: { ownerId: userId } },
    }),
    prisma.examQuestion.count({
      where: { question: { type: "FILL_BLANK" } },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const baseNo = (page - 1) * PAGE_SIZE;

  const stats = [
    { icon: SquarePen, label: "公共填空题", num: total },
    { icon: Sparkles, label: "我创建的", num: mineCount },
    { icon: FileText, label: "被试卷引用", num: totalRefCount, accent: true },
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
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return `/t/banks/fill${s ? `?${s}` : ""}`;
  }

  function stripMarkdown(md: string): string {
    return md
      .replace(/```[\s\S]*?```/g, "[代码]")
      .replace(/!\[.*?\]\(.*?\)/g, "[图片]")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*_`>#-]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  return (
    <>
      <Topbar crumbs={[{ label: "题库", href: "/t/banks/fill" }, { label: "填空题" }]} />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">填空题公共库</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              所有填空题共享。你只能编辑自己创建的（进入所属题库编辑）；管理员可编辑全部。
            </p>
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
                    <div className="mt-3 text-3xl font-bold tracking-tight num">{s.num}</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">来源：</span>
              {sourceTabs.map((t) => {
                const active = source === t.key;
                const qs = new URLSearchParams();
                if (t.key !== "all") qs.set("source", t.key);
                if (difficultyFilter) qs.set("difficulty", difficultyFilter);
                if (page > 1) qs.set("page", String(page));
                const href = `/t/banks/fill${qs.toString() ? `?${qs}` : ""}`;
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
                href={`/t/banks/fill${source !== "all" ? `?source=${source}` : ""}`}
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
                if (page > 1) qs.set("page", String(page));
                return (
                  <Link
                    key={d}
                    href={`/t/banks/fill?${qs}`}
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

          {questions.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <SquarePen className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">没有匹配的填空题</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    在「我的题库」中新建填空题，或在试卷里添加题目
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
                      <th className="w-16 px-6 py-3 text-right">编号</th>
                      <th className="px-6 py-3">题干</th>
                      <th className="px-6 py-3">难度</th>
                      <th className="px-6 py-3">空位数</th>
                      <th className="px-6 py-3">答案</th>
                      <th className="px-6 py-3">所属题库</th>
                      <th className="px-6 py-3 text-right">被引用</th>
                      <th className="w-28 px-6 py-3 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {questions.map((q, i) => {
                      const diff = DIFFICULTY_LABELS[q.difficulty];
                      const isMine = q.bank?.ownerId === userId;
                      const answers = Array.isArray(q.answer)
                        ? (q.answer as string[])
                        : typeof q.answer === "string"
                          ? [q.answer]
                          : [];
                      const preview = stripMarkdown(q.content).slice(0, 80);
                      return (
                        <tr key={q.id} className="group transition-colors hover:bg-muted/30">
                          <td className="px-6 py-3.5 text-right num font-mono text-xs text-subtle-foreground">
                            #{(baseNo + i + 1).toString().padStart(3, "0")}
                          </td>
                          <td className="px-6 py-3.5">
                            <div className="flex items-start gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="line-clamp-2 text-sm text-foreground">
                                  {preview || "（无题干）"}
                                </div>
                              </div>
                              {isMine ? (
                                <Badge variant="primary" className="shrink-0 font-normal">
                                  我的
                                </Badge>
                              ) : (
                                <Badge variant="default" className="shrink-0 font-normal">
                                  公共
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-3.5">
                            <Badge variant={diff.tone} className="font-normal">
                              {diff.label}
                            </Badge>
                          </td>
                          <td className="px-6 py-3.5 text-xs text-muted-foreground num">
                            {answers.length} 个
                          </td>
                          <td className="px-6 py-3.5">
                            <div className="flex flex-wrap gap-1">
                              {answers.slice(0, 3).map((a, k) => (
                                <span
                                  key={k}
                                  className="rounded-md bg-success-subtle px-1.5 py-0.5 text-xs font-medium text-success"
                                >
                                  {String(a).slice(0, 16)}
                                </span>
                              ))}
                              {answers.length > 3 && (
                                <span className="text-[11px] text-subtle-foreground">
                                  +{answers.length - 3}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-3.5">
                            {q.bank ? (
                              <Link
                                href={`/t/banks/${q.bank.id}`}
                                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                              >
                                <Library className="h-3 w-3" />
                                {q.bank.name}
                                {!isMine && (
                                  <span className="text-subtle-foreground">·只读</span>
                                )}
                              </Link>
                            ) : (
                              <span className="text-xs text-subtle-foreground">—</span>
                            )}
                          </td>
                          <td className="px-6 py-3.5 text-right num">
                            {q._count.examQuestions > 0 ? (
                              <span className="font-medium text-foreground">
                                {q._count.examQuestions}
                              </span>
                            ) : (
                              <span className="text-subtle-foreground">0</span>
                            )}
                          </td>
                          <td className="px-6 py-3.5 text-right">
                            <div className="inline-flex items-center gap-0.5">
                              <PreviewLink id={q.id} />
                              {(isMine || isAdmin) && q.bank && (
                                <EditLink
                                  href={`/t/banks/${q.bank.id}`}
                                  title="进入所属题库编辑"
                                />
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
              <span className="text-muted-foreground num">
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