"use client";

import * as React from "react";
import { useActionState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, ListChecks, Hash, FileCode, Code } from "lucide-react";
import { TYPE_LABEL } from "@/app/t/questions/_components/forms";
import {
  QuestionFormDialog,
  type QuestionFormState,
} from "@/app/t/questions/_components/question-form-dialog";
import {
  addQuestionToBankAction,
} from "@/app/t/banks/actions";
import type { Difficulty, QuestionType } from "@prisma/client";
import { useRouter } from "next/navigation";

export type BankPanelQuestion = {
  questionId: string;
  type: QuestionType;
  content: string;
  difficulty: Difficulty;
  score: number;
  options?: { key: string; text: string }[];
  answer?: string | string[];
  explanation?: string | null;
  problemId?: string;
  problemTitle?: string;
  referencedByCount: number;
};

const TYPE_TABS: {
  key: QuestionType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: "SINGLE_CHOICE", label: "单选", icon: ListChecks },
  { key: "FILL_BLANK", label: "填空", icon: Hash },
  { key: "CODE_BLANK", label: "代码填空", icon: FileCode },
  { key: "PROGRAMMING", label: "编程", icon: Code },
];

export function BankQuestionsPanel({
  bankId,
  questions,
  availableProblems,
  searchParams,
}: {
  bankId: string;
  questions: BankPanelQuestion[];
  availableProblems: Array<{ id: string; title: string; difficulty: Difficulty; isPublic: boolean }>;
  searchParams: { type?: string };
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = React.useState(false);

  const counts = React.useMemo(() => {
    const m = new Map<QuestionType, number>();
    for (const q of questions) m.set(q.type, (m.get(q.type) ?? 0) + 1);
    return m;
  }, [questions]);

  // 默认 tab = 数量最多的题型
  const initialTab = React.useMemo<QuestionType>(() => {
    const fromUrl = searchParams.type as QuestionType | undefined;
    if (fromUrl && TYPE_TABS.some((t) => t.key === fromUrl)) return fromUrl;
    let best: QuestionType = "SINGLE_CHOICE";
    let bestN = -1;
    for (const t of TYPE_TABS) {
      const n = counts.get(t.key) ?? 0;
      if (n > bestN) {
        bestN = n;
        best = t.key;
      }
    }
    return best;
  }, [counts, searchParams.type]);

  const [activeTab, setActiveTab] = React.useState<QuestionType>(initialTab);

  const [addState, addFormAction, addPending] = useActionState<
    QuestionFormState | undefined,
    FormData
  >(async (_prev, fd) => addQuestionToBankAction(bankId, _prev, fd), undefined);

  React.useEffect(() => {
    if (addState?.ok) {
      setAddOpen(false);
      router.refresh();
    }
  }, [addState, router]);

  const tabQuestions = questions.filter((q) => q.type === activeTab);

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">题库题目</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              共 <span className="num">{questions.length}</span> 题 · 按题型分类管理
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            添加题目
          </Button>
        </div>

        {questions.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-12 text-center text-sm text-muted-foreground">
            <Code className="mx-auto h-8 w-8 text-subtle-foreground" />
            <p className="mt-3">题库还是空的</p>
            <p className="mt-1 text-xs text-subtle-foreground">
              点击右上角「添加题目」开始收录
            </p>
          </div>
        ) : (
          <>
            <div className="mt-4 flex items-center gap-1 border-b border-border">
              {TYPE_TABS.map((t) => {
                const Icon = t.icon;
                const count = counts.get(t.key) ?? 0;
                const active = t.key === activeTab;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setActiveTab(t.key)}
                    className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm transition-colors ${
                      active
                        ? "border-primary font-medium text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {t.label}
                    <span
                      className={`num rounded-md px-1.5 py-0.5 text-xs ${
                        active
                          ? "bg-primary-subtle text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <BankQuestionList
              bankId={bankId}
              questions={tabQuestions}
              availableProblems={availableProblems}
            />
          </>
        )}

        {addOpen && (
          <QuestionFormDialog
            mode="add"
            initialType={activeTab}
            formAction={addFormAction}
            state={addState ?? null}
            pending={addPending}
            availableProblems={availableProblems}
            onClose={() => setAddOpen(false)}
          />
        )}
      </CardContent>
    </Card>
  );
}

// 内层列表（含编辑）
import { useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import {
  DIFFICULTY_LABELS,
} from "@/app/t/questions/_components/forms";
import {
  updateQuestionAction,
  removeQuestionFromBankAction,
} from "@/app/t/banks/actions";

function BankQuestionList({
  bankId,
  questions,
  availableProblems,
}: {
  bankId: string;
  questions: BankPanelQuestion[];
  availableProblems: Array<{ id: string; title: string; difficulty: Difficulty; isPublic: boolean }>;
}) {
  const router = useRouter();
  const [_, startTransition] = useTransition();
  const [editing, setEditing] = React.useState<BankPanelQuestion | null>(null);

  const [editState, editFormAction, editPending] = useActionState<
    QuestionFormState | undefined,
    FormData
  >(
    async (_prev, fd) => {
      const qid = fd.get("questionId")?.toString();
      if (!qid) return { error: "缺少 questionId" } as QuestionFormState;
      return updateQuestionAction(qid, _prev, fd);
    },
    undefined,
  );

  React.useEffect(() => {
    if (editState?.ok) {
      setEditing(null);
      router.refresh();
    }
  }, [editState, router]);

  function handleRemove(q: BankPanelQuestion) {
    if (q.referencedByCount > 0) {
      alert(`该题已被 ${q.referencedByCount} 份试卷引用，无法删除`);
      return;
    }
    if (!confirm(`确定从题库移除「${previewContent(q)}」吗？`)) return;
    startTransition(async () => {
      try {
        await removeQuestionFromBankAction(bankId, q.questionId);
        router.refresh();
      } catch (e) {
        alert((e as Error).message);
      }
    });
  }

  if (questions.length === 0) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-10 text-center text-sm text-muted-foreground">
        {TYPE_LABEL[questions[0]?.type ?? "SINGLE_CHOICE"]}暂无题目
      </div>
    );
  }

  return (
    <>
      <ul className="mt-4 space-y-2">
        {questions.map((q, idx) => {
          const diff = DIFFICULTY_LABELS[q.difficulty];
          const isProgramming = q.type === "PROGRAMMING";
          const canEdit = !isProgramming;
          const canDelete = q.referencedByCount === 0;
          return (
            <li
              key={q.questionId}
              className="rounded-lg border border-border bg-card p-3"
            >
              <div className="flex items-start gap-3">
                <span className="num font-mono text-xs text-subtle-foreground">
                  #{idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant={diff.tone} className="font-normal">
                      {diff.label}
                    </Badge>
                    <span className="num">{q.score} 分</span>
                    {isProgramming && q.problemTitle && (
                      <span className="text-muted-foreground">引用：{q.problemTitle}</span>
                    )}
                    {q.referencedByCount > 0 && (
                      <Badge variant="warning" className="font-normal">
                        被 {q.referencedByCount} 份试卷引用
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2 whitespace-pre-line text-sm text-foreground">
                    {q.type === "PROGRAMMING" && q.problemTitle
                      ? q.problemTitle
                      : truncate(q.content, 80)}
                  </div>
                  {q.type === "SINGLE_CHOICE" && q.options && (
                    <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                      {q.options.map((o) => (
                        <li key={o.key} className="flex items-start gap-2">
                          <span className="num font-mono font-semibold">{o.key}.</span>
                          <span>{truncate(o.text, 40)}</span>
                          {q.answer === o.key && (
                            <span className="ml-1 text-success">✓</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {(q.type === "FILL_BLANK" || q.type === "CODE_BLANK") &&
                    Array.isArray(q.answer) && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="text-muted-foreground">答案：</span>
                        {q.answer.map((a, i) => (
                          <code
                            key={i}
                            className="num rounded bg-muted px-1.5 py-0.5 font-mono text-foreground"
                          >
                            {`{{${i + 1}}}: ${truncate(a, 24)}`}
                          </code>
                        ))}
                      </div>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {canEdit && (
                    <Button variant="outline" size="sm" onClick={() => setEditing(q)}>
                      编辑
                    </Button>
                  )}
                  <button
                    type="button"
                    aria-label="删除"
                    disabled={!canDelete}
                    onClick={() => handleRemove(q)}
                    className="rounded-md p-1.5 text-subtle-foreground transition-colors hover:bg-danger-subtle hover:text-danger disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-subtle-foreground"
                    title={canDelete ? "删除" : "已被试卷引用，无法删除"}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {editing && (
        <QuestionFormDialog
          mode="edit"
          formAction={editFormAction}
          state={editState ?? null}
          pending={editPending}
          defaultValue={{
            questionId: editing.questionId,
            type: editing.type,
            content: editing.content,
            options: editing.options,
            answer: editing.answer,
            score: editing.score,
            difficulty: editing.difficulty,
            explanation: editing.explanation ?? undefined,
            problemId: editing.problemId,
          }}
          availableProblems={availableProblems}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function truncate(s: string | undefined | null, n: number) {
  const v = s ?? "";
  return v.length > n ? `${v.slice(0, n)}…` : v;
}

function previewContent(q: BankPanelQuestion) {
  if (q.type === "PROGRAMMING" && q.problemTitle) return q.problemTitle;
  return truncate(q.content, 40);
}