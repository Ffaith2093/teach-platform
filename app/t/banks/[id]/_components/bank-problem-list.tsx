"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import type { Difficulty } from "@prisma/client";
import { removeProblemFromBankAction } from "@/app/t/banks/actions";

const DIFFICULTY_LABELS: Record<Difficulty, { label: string; tone: "success" | "warning" | "danger" }> = {
  EASY: { label: "入门", tone: "success" },
  MEDIUM: { label: "中等", tone: "warning" },
  HARD: { label: "进阶", tone: "danger" },
};

interface QuestionRow {
  questionId: string;
  problemId: string;
  title: string;
  difficulty: Difficulty;
  tags: string[];
  isPublic: boolean;
  testCaseCount: number;
  score: number;
}

export function BankProblemList({
  bankId,
  questions,
}: {
  bankId: string;
  questions: QuestionRow[];
}) {
  const router = useRouter();
  const [, startTransition] = React.useTransition();

  function handleRemove(problemId: string, title: string) {
    if (!confirm(`确定从题库移除「${title}」吗？`)) return;
    startTransition(async () => {
      await removeProblemFromBankAction(bankId, problemId);
      router.refresh();
    });
  }

  return (
    <ul className="mt-4 space-y-2">
      {questions.map((q, idx) => {
        const diff = DIFFICULTY_LABELS[q.difficulty];
        return (
          <li
            key={q.questionId}
            className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
          >
            <span className="num font-mono text-xs text-subtle-foreground">#{idx + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Link
                  href={`/t/problems/${q.problemId}`}
                  className="hover:text-primary"
                >
                  {q.title}
                </Link>
                <Badge variant={diff.tone} className="font-normal">
                  {diff.label}
                </Badge>
                {q.isPublic && (
                  <Badge variant="default" className="font-normal">
                    共享
                  </Badge>
                )}
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="num">{q.testCaseCount} 个测试用例</span>
                {q.tags.length > 0 && (
                  <>
                    <span>·</span>
                    <span>{q.tags.slice(0, 3).join(" · ")}</span>
                  </>
                )}
              </div>
            </div>
            <button
              type="button"
              aria-label="移除"
              onClick={() => handleRemove(q.problemId, q.title)}
              className="rounded-md p-1.5 text-subtle-foreground transition-colors hover:bg-danger-subtle hover:text-danger"
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}