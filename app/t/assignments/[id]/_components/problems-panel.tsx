"use client";

import * as React from "react";
import { useActionState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Code, Plus, X, Search } from "lucide-react";
import type { Difficulty } from "@prisma/client";
import {
  addProblemToAssignmentAction,
  removeProblemFromAssignmentAction,
} from "@/app/t/assignments/actions";

const DIFFICULTY_LABELS: Record<Difficulty, { label: string; tone: "success" | "warning" | "danger" }> = {
  EASY: { label: "入门", tone: "success" },
  MEDIUM: { label: "中等", tone: "warning" },
  HARD: { label: "进阶", tone: "danger" },
};

interface ProblemRow {
  id: string;
  title: string;
  difficulty: Difficulty;
  tags: string[];
  timeLimitMs: number;
  memoryLimitMb: number;
  testCaseCount: number;
  score: number;
  order: number;
}

interface AvailableProblem {
  id: string;
  title: string;
  difficulty: Difficulty;
  isPublic: boolean;
}

export function ProblemsPanel({
  assignmentId,
  isDraft,
  problems,
  available,
}: {
  assignmentId: string;
  isDraft: boolean;
  problems: ProblemRow[];
  available: AvailableProblem[];
}) {
  const [addOpen, setAddOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const [state, formAction, pending] = useActionState(
    async (prev: { error?: string; ok?: boolean } | undefined, fd: FormData) =>
      addProblemToAssignmentAction(assignmentId, prev, fd),
    undefined,
  );

  const [, startAddTransition] = React.useTransition();
  const [, startRemoveTransition] = React.useTransition();

  function handleAdd(problemId: string) {
    const fd = new FormData();
    fd.set("problemId", problemId);
    fd.set("score", "20");
    startAddTransition(() => formAction(fd));
    setAddOpen(false);
    setSearch("");
  }

  function handleRemove(problemId: string) {
    if (!confirm("确定移除这道题吗？")) return;
    startRemoveTransition(async () => {
      await removeProblemFromAssignmentAction(assignmentId, problemId);
    });
  }

  const usedIds = new Set(problems.map((p) => p.id));
  const candidates = available.filter((p) => {
    if (usedIds.has(p.id)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return p.title.toLowerCase().includes(q);
  });

  const totalScore = problems.reduce((s, p) => s + p.score, 0);

  return (
    <>
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">作业题目</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {problems.length} 道题 · 总分 <span className="num">{totalScore}</span>
                {!isDraft && " · 作业已发布，不可再修改"}
              </p>
            </div>
            {isDraft && (
              <Button
                size="sm"
                onClick={() => setAddOpen(true)}
                disabled={available.length === 0}
              >
                <Plus />
                添加编程题
              </Button>
            )}
          </div>

          {problems.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-12 text-center text-sm text-muted-foreground">
              <Code className="mx-auto h-8 w-8 text-subtle-foreground" />
              <p className="mt-3">还没有挂载任何编程题</p>
              {isDraft ? (
                <p className="mt-1 text-xs text-subtle-foreground">
                  点击右上角「添加编程题」开始选择
                </p>
              ) : (
                <p className="mt-1 text-xs text-subtle-foreground">作业已发布，不可再修改</p>
              )}
            </div>
          ) : (
            <ul className="mt-4 space-y-2">
              {problems.map((p, i) => {
                const diff = DIFFICULTY_LABELS[p.difficulty];
                return (
                  <li
                    key={p.id}
                    className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
                  >
                    <span className="num font-mono text-xs text-subtle-foreground">
                      #{i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        {p.title}
                        <Badge variant={diff.tone} className="font-normal">
                          {diff.label}
                        </Badge>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="num">{p.testCaseCount} 个测试用例</span>
                        <span>·</span>
                        <span className="num">
                          {p.timeLimitMs}ms / {p.memoryLimitMb}MB
                        </span>
                        {p.tags.length > 0 && (
                          <>
                            <span>·</span>
                            <span>{p.tags.slice(0, 3).join(" · ")}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted px-2.5 py-1">
                      <span className="text-xs text-muted-foreground">分值</span>
                      <span className="num text-sm font-semibold text-foreground">
                        {p.score}
                      </span>
                    </div>
                    {isDraft && (
                      <button
                        type="button"
                        aria-label="移除"
                        onClick={() => handleRemove(p.id)}
                        className="rounded-md p-1.5 text-subtle-foreground transition-colors hover:bg-danger-subtle hover:text-danger"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {state?.error && (
            <div className="mt-3 rounded-lg border border-danger/30 bg-danger-subtle/40 px-3 py-2 text-xs text-danger">
              {state.error}
            </div>
          )}
        </CardContent>
      </Card>

      {addOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => {
            setAddOpen(false);
            setSearch("");
          }}
        >
          <div
            className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">添加编程题</h3>
              <button
                type="button"
                aria-label="关闭"
                onClick={() => {
                  setAddOpen(false);
                  setSearch("");
                }}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="按题名筛选…"
                className="flex h-9 w-full rounded-lg border border-border bg-muted pl-9 pr-3 text-sm focus-visible:border-primary focus-visible:bg-card focus-visible:outline-none"
              />
            </div>
            <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-border">
              {candidates.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  {available.length === 0
                    ? "没有可添加的编程题（您需要先创建或公开题目）"
                    : "没有匹配的编程题"}
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {candidates.map((p) => {
                    const diff = DIFFICULTY_LABELS[p.difficulty];
                    return (
                      <li
                        key={p.id}
                        className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
                        onClick={() => handleAdd(p.id)}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                            {p.title}
                            <Badge variant={diff.tone} className="font-normal">
                              {diff.label}
                            </Badge>
                            {p.isPublic ? (
                              <Badge variant="default" className="font-normal">
                                公开库
                              </Badge>
                            ) : (
                              <Badge variant="primary" className="font-normal">
                                我的
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Button type="button" size="sm" variant="outline">
                          添加（默认 20 分）
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}