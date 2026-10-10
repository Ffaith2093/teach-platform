"use client";

import * as React from "react";
import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Plus,
  X,
  ListChecks,
  Code,
} from "lucide-react";
import {
  DIFFICULTY_LABELS,
  TYPE_LABEL,
} from "@/app/t/questions/_components/forms";
import {
  addQuestionToExamAction,
  removeQuestionFromExamAction,
  type AddQuestionState,
} from "@/app/t/exams/actions";
import type { Difficulty, QuestionType } from "@prisma/client";
import { ExamQuestionPicker } from "./exam-question-picker";

type QuestionRow = {
  questionId: string;
  type: QuestionType;
  content: string;
  difficulty: Difficulty;
  score: number;
  detail?: {
    options?: { key: string; text: string }[];
    answer?: unknown;
    problemTitle?: string;
    problemId?: string;
  };
};

export function QuestionsPanel({
  examId,
  questions,
  availableProblems,
  availableLibraryQuestions,
  isDraft,
  isDraw = false,
  actualCount,
  examTotalScore,
}: {
  examId: string;
  questions: QuestionRow[];
  availableProblems: Array<{
    id: string;
    title: string;
    difficulty: Difficulty;
    isPublic: boolean;
  }>;
  availableLibraryQuestions: Array<{
    id: string;
    type: "SINGLE_CHOICE" | "FILL_BLANK";
    content: string;
    difficulty: Difficulty;
    defaultScore: number;
    bankName: string;
  }>;
  isDraft: boolean;
  isDraw?: boolean;
  actualCount?: number;
  examTotalScore?: number;
}) {
  const editable = isDraft && !isDraw;
  const router = useRouter();
  const [addOpen, setAddOpen] = React.useState(false);
  const [, startRemoveTransition] = useTransition();

  const [addState, addFormAction, addPending] = useActionState<
    AddQuestionState | undefined,
    FormData
  >(
    async (_prev, fd) => addQuestionToExamAction(examId, _prev, fd),
    undefined,
  );

  React.useEffect(() => {
    if (addState?.ok) {
      setAddOpen(false);
      router.refresh();
    }
  }, [addState, router]);

  function handleRemove(questionId: string) {
    if (!confirm("确定移除这道题吗？")) return;
    startRemoveTransition(async () => {
      await removeQuestionFromExamAction(examId, questionId);
      router.refresh();
    });
  }

  const totalScore = questions.reduce((s, q) => s + q.score, 0);

  // 按题型分组
  const byType = new Map<QuestionType, QuestionRow[]>();
  for (const q of questions) {
    const arr = byType.get(q.type) ?? [];
    arr.push(q);
    byType.set(q.type, arr);
  }
  const typeOrder: QuestionType[] = ["SINGLE_CHOICE", "FILL_BLANK", "PROGRAMMING", "CODE_BLANK"];

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">试卷题目</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {isDraw ? <>每份 <span className="num">{actualCount}</span> 题 · <span className="num">{examTotalScore}</span> 分 · 候选池 {questions.length} 题</> : <><span className="num">{questions.length}</span> 道题 · 总分 <span className="num">{totalScore}</span></>}{" "}
              {!editable && "· 不可单独修改题目"}
            </p>
          </div>
          {editable && (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus />
              添加题目
            </Button>
          )}
        </div>

        {questions.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-12 text-center text-sm text-muted-foreground">
            <ListChecks className="mx-auto h-8 w-8 text-subtle-foreground" />
            <p className="mt-3">还没有添加任何题目</p>
            {editable && (
              <p className="mt-1 text-xs text-subtle-foreground">
                点击右上角「添加题目」开始出卷
              </p>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {typeOrder
              .filter((t) => byType.has(t))
              .map((t) => {
                const arr = byType.get(t)!;
                return (
                  <div key={t}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {TYPE_LABEL[t]}
                      <span className="ml-2 num text-subtle-foreground">{arr.length}</span>
                    </p>
                    <ul className="space-y-2">
                      {arr.map((q, idx) => (
                        <QuestionRowItem
                          key={q.questionId}
                          index={idx + 1}
                          row={q}
                          isDraft={editable}
                          onRemove={() => handleRemove(q.questionId)}
                        />
                      ))}
                    </ul>
                  </div>
                );
              })}
          </div>
        )}

        {addOpen && (
          <ExamQuestionPicker
            formAction={addFormAction}
            state={addState ?? null}
            pending={addPending}
            questions={availableLibraryQuestions}
            problems={availableProblems}
            onClose={() => setAddOpen(false)}
          />
        )}
      </CardContent>
    </Card>
  );
}

function QuestionRowItem({
  index,
  row,
  isDraft,
  onRemove,
}: {
  index: number;
  row: QuestionRow;
  isDraft: boolean;
  onRemove: () => void;
}) {
  return (
    <li className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start gap-3">
        <span className="num font-mono text-xs text-subtle-foreground">#{index}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant={DIFFICULTY_LABELS[row.difficulty].tone} className="font-normal">
              {DIFFICULTY_LABELS[row.difficulty].label}
            </Badge>
            <span className="num">{row.score} 分</span>
          </div>
          <div className="mt-2 whitespace-pre-line text-sm text-foreground">
            {row.content}
          </div>

          {row.detail?.options && (
            <ul className="mt-2 space-y-1 text-sm">
              {row.detail.options.map((o) => (
                <li key={o.key} className="flex items-start gap-2 text-muted-foreground">
                  <span className="num font-mono text-xs font-semibold">{o.key}.</span>
                  <span>{o.text}</span>
                </li>
              ))}
            </ul>
          )}
          {row.type === "FILL_BLANK" && Array.isArray(row.detail?.answer) && (
            <div className="mt-2 text-xs text-muted-foreground">
              答案：
              {(row.detail.answer as string[]).map((a, i) => (
                <span key={i} className="num ml-1.5 rounded bg-muted px-1.5 py-0.5">
                  {a}
                </span>
              ))}
            </div>
          )}
          {row.type === "CODE_BLANK" && Array.isArray(row.detail?.answer) && (
            <div className="mt-2 text-xs text-muted-foreground">
              <span className="mr-1">填空答案：</span>
              {(row.detail.answer as string[]).map((a, i) => (
                <code
                  key={i}
                  className="num ml-1.5 inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-foreground"
                >
                  {`{{${i + 1}}}: ${a}`}
                </code>
              ))}
            </div>
          )}
          {row.type === "PROGRAMMING" && row.detail?.problemTitle && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Code className="h-3 w-3" />
              <span>引用编程题：{row.detail.problemTitle}</span>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <div className="num rounded-md border border-border bg-muted px-2.5 py-1 text-sm font-semibold text-foreground">
            {row.score}
          </div>
          {isDraft && (
            <button
              type="button"
              onClick={onRemove}
              className="rounded-md p-1.5 text-subtle-foreground transition-colors hover:bg-danger-subtle hover:text-danger"
              aria-label="移除"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
