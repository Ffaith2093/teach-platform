"use client";

import * as React from "react";
import { Check, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AddQuestionState } from "@/app/t/exams/actions";
import type { Difficulty } from "@prisma/client";

type LibraryQuestion = {
  id: string;
  type: "SINGLE_CHOICE" | "FILL_BLANK";
  content: string;
  difficulty: Difficulty;
  defaultScore: number;
  bankName: string;
};

type ProgrammingProblem = {
  id: string;
  title: string;
  difficulty: Difficulty;
  isPublic: boolean;
};

const TYPE_LABEL = {
  SINGLE_CHOICE: "选择题",
  FILL_BLANK: "填空题",
  PROGRAMMING: "编程题",
} as const;

const DIFFICULTY_LABEL = { EASY: "入门", MEDIUM: "中等", HARD: "进阶" } as const;

export function ExamQuestionPicker({
  formAction,
  state,
  pending,
  questions,
  problems,
  onClose,
}: {
  formAction: (formData: FormData) => void;
  state: AddQuestionState | null;
  pending: boolean;
  questions: LibraryQuestion[];
  problems: ProgrammingProblem[];
  onClose: () => void;
}) {
  const [type, setType] = React.useState<keyof typeof TYPE_LABEL>("SINGLE_CHOICE");
  const [query, setQuery] = React.useState("");
  const [selections, setSelections] = React.useState<
    Record<string, { kind: "LIBRARY" | "PROGRAMMING"; id: string; score: number; title: string }>
  >({});

  const normalized = query.trim().toLowerCase().replace(/^#/, "");
  const filteredQuestions = questions.filter((question) => {
    if (question.type !== type) return false;
    if (!normalized) return true;
    const shortId = question.id.slice(-8).toLowerCase();
    return question.id.toLowerCase().includes(normalized) || shortId.includes(normalized) || question.content.toLowerCase().includes(normalized);
  });
  const filteredProblems = problems.filter((problem) => {
    if (!normalized) return true;
    return problem.id.toLowerCase().includes(normalized) || problem.id.slice(-8).toLowerCase().includes(normalized) || problem.title.toLowerCase().includes(normalized);
  });

  function toggle(kind: "LIBRARY" | "PROGRAMMING", id: string, title: string, defaultScore = 10) {
    const key = `${kind}:${id}`;
    setSelections((current) => {
      if (current[key]) {
        const next = { ...current };
        delete next[key];
        return next;
      }
      return {
        ...current,
        [key]: { kind, id, title, score: Math.max(1, defaultScore) },
      };
    });
  }

  function updateScore(key: string, score: number) {
    setSelections((current) => ({
      ...current,
      [key]: { ...current[key], score: Math.max(1, Math.min(100, score || 1)) },
    }));
  }

  const selectedItems = Object.values(selections);
  const totalScore = selectedItems.reduce((sum, item) => sum + item.score, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h3 className="text-base font-semibold">从题库添加题目</h3>
            <p className="mt-1 text-xs text-muted-foreground">按题号或题干搜索，题目内容保持与题库一致。</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-1 border-b border-border px-5 py-3">
          {(Object.keys(TYPE_LABEL) as Array<keyof typeof TYPE_LABEL>).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => { setType(value); setQuery(""); }}
              className={`rounded-md px-3 py-1.5 text-sm ${type === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              {TYPE_LABEL[value]}
            </button>
          ))}
        </div>

        <div className="border-b border-border px-5 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={type === "PROGRAMMING" ? "搜索编程题号或标题" : "搜索题号或题干"}
              className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {type === "PROGRAMMING" ? (
            filteredProblems.length ? (
              <div className="space-y-2">
                {filteredProblems.map((problem) => (
                  <PickerRow
                    key={problem.id}
                    id={problem.id}
                    selected={Boolean(selections[`PROGRAMMING:${problem.id}`])}
                    title={problem.title}
                    meta={`${DIFFICULTY_LABEL[problem.difficulty]} · ${problem.isPublic ? "公共题" : "我的题目"}`}
                    score={selections[`PROGRAMMING:${problem.id}`]?.score ?? 20}
                    onScoreChange={(score) => updateScore(`PROGRAMMING:${problem.id}`, score)}
                    onSelect={() => toggle("PROGRAMMING", problem.id, problem.title, 20)}
                  />
                ))}
              </div>
            ) : <Empty />
          ) : filteredQuestions.length ? (
            <div className="space-y-2">
              {filteredQuestions.map((question) => (
                <PickerRow
                  key={question.id}
                  id={question.id}
                  selected={Boolean(selections[`LIBRARY:${question.id}`])}
                  title={question.content.replace(/\s+/g, " ").slice(0, 120) || "（无题干）"}
                  meta={`${question.bankName} · ${DIFFICULTY_LABEL[question.difficulty]}`}
                  score={selections[`LIBRARY:${question.id}`]?.score ?? question.defaultScore}
                  onScoreChange={(score) => updateScore(`LIBRARY:${question.id}`, score)}
                  onSelect={() => toggle("LIBRARY", question.id, question.content, question.defaultScore)}
                />
              ))}
            </div>
          ) : <Empty />}
        </div>

        <form action={formAction} className="flex flex-wrap items-end gap-3 border-t border-border bg-muted/30 px-5 py-4">
          <input
            type="hidden"
            name="selections"
            value={JSON.stringify(selectedItems.map(({ kind, id, score }) => ({ kind, id, score })))}
          />
          <div className="min-w-0 flex-1">
            {selectedItems.length ? (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="primary">已选择 {selectedItems.length} 道题</Badge>
                <span className="num text-xs text-muted-foreground">合计 {totalScore} 分</span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">可跨题型选择多道题目</span>
            )}
            {state?.error && <p className="mt-1 text-xs text-danger">{state.error}</p>}
          </div>
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="submit" disabled={pending || selectedItems.length === 0}>
            {pending ? "添加中…" : `添加 ${selectedItems.length} 道题`}
          </Button>
        </form>
      </div>
    </div>
  );
}

function PickerRow({
  id,
  selected,
  title,
  meta,
  score,
  onScoreChange,
  onSelect,
}: {
  id: string;
  selected: boolean;
  title: string;
  meta: string;
  score: number;
  onScoreChange: (score: number) => void;
  onSelect: () => void;
}) {
  return (
    <div
      className={`flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors ${selected ? "border-primary bg-primary-subtle/50" : "border-border hover:bg-muted/50"}`}
    >
      <button
        type="button"
        onClick={onSelect}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}
        aria-label={selected ? "取消选择" : "选择题目"}
      >
        {selected && <Check className="h-3.5 w-3.5" />}
      </button>
      <span className="min-w-0 flex-1">
        <button type="button" onClick={onSelect} className="block w-full text-left text-sm text-foreground">
          {title}
        </button>
        <span className="mt-1 block text-xs text-muted-foreground">#{id.slice(-8).toUpperCase()} · {meta}</span>
      </span>
      {selected && (
        <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <span>分值</span>
          <input
            type="number"
            min={1}
            max={100}
            value={score}
            onChange={(event) => onScoreChange(Number(event.target.value))}
            className="num h-8 w-16 rounded-md border border-border bg-card px-2 text-center text-sm text-foreground outline-none focus:border-primary"
          />
        </label>
      )}
    </div>
  );
}

function Empty() {
  return <div className="rounded-md border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">没有匹配的题目</div>;
}
