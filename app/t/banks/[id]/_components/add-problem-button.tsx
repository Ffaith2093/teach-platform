"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Difficulty } from "@prisma/client";
import { addProblemToBankAction } from "@/app/t/banks/actions";

const DIFFICULTY_LABELS: Record<Difficulty, { label: string; tone: "success" | "warning" | "danger" }> = {
  EASY: { label: "入门", tone: "success" },
  MEDIUM: { label: "中等", tone: "warning" },
  HARD: { label: "进阶", tone: "danger" },
};

interface ProblemOption {
  id: string;
  title: string;
  difficulty: Difficulty;
  isPublic: boolean;
}

export function AddProblemButton({
  bankId,
  problems,
}: {
  bankId: string;
  problems: ProblemOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [, startTransition] = React.useTransition();

  const filtered = problems.filter((p) =>
    !search ? true : p.title.toLowerCase().includes(search.toLowerCase()),
  );

  function handleAdd(problemId: string) {
    startTransition(async () => {
      await addProblemToBankAction(bankId, problemId);
      router.refresh();
      setOpen(false);
      setSearch("");
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={problems.length === 0}>
        <Plus />
        添加编程题
      </Button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => {
            setOpen(false);
            setSearch("");
          }}
        >
          <div
            className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">添加编程题到题库</h3>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
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
              {problems.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  没有可添加的编程题（您需要先创建或共享题目）
                </p>
              ) : filtered.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  没有匹配的编程题
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {filtered.map((p) => {
                    const diff = DIFFICULTY_LABELS[p.difficulty];
                    return (
                      <li
                        key={p.id}
                        className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
                        onClick={() => handleAdd(p.id)}
                      >
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
                        <Button type="button" size="sm" variant="outline">
                          添加
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