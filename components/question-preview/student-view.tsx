"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CodeEditor } from "@/components/code-editor";
import type { Difficulty, QuestionType } from "@prisma/client";
import { MarkdownContent } from "@/components/markdown-content";

export interface ChoiceOption {
  key: string;
  text: string;
}

export interface PreviewQuestion {
  type: QuestionType;
  content: string;
  difficulty: Difficulty;
  score: number;
  index: number;
  /** SINGLE_CHOICE 才有 */
  options?: ChoiceOption[] | null;
  /** FILL_BLANK / CODE_BLANK 才有 */
  blankCount?: number;
  /** PROGRAMMING 才有 */
  problem?: {
    title: string;
    description: string;
    starterCode: string;
  } | null;
}

const TYPE_LABEL: Record<QuestionType, string> = {
  SINGLE_CHOICE: "单选题",
  FILL_BLANK: "填空题",
  CODE_BLANK: "代码填空",
  PROGRAMMING: "编程题",
};

function blankCountFromContent(content: string): number {
  const m = content.match(/\{\{\s*\d+\s*\}\}/g);
  return m ? m.length : 1;
}

/**
 * 学生在作答时看到的题目视图（纯展示 + 内存态交互，不持久化）。
 */
export function StudentQuestionView({ q }: { q: PreviewQuestion }) {
  const [choiceValue, setChoiceValue] = React.useState<string | null>(null);
  const [fillValues, setFillValues] = React.useState<string[]>([]);
  const [code, setCode] = React.useState<string>(q.problem?.starterCode ?? "");

  const blanks =
    q.blankCount ??
    (q.type === "FILL_BLANK" || q.type === "CODE_BLANK" ? blankCountFromContent(q.content) : 0);

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="num text-sm font-semibold text-primary">第 {q.index} 题</span>
            <Badge variant="default">{TYPE_LABEL[q.type]}</Badge>
          </div>
          <span className="num shrink-0 text-xs text-muted-foreground">{q.score} 分</span>
        </div>

        <MarkdownContent
          content={q.type === "PROGRAMMING" && q.problem ? q.problem.title : q.content}
          className="mt-3"
        />

        {q.type === "PROGRAMMING" && q.problem && (
          <MarkdownContent
            content={q.problem.description}
            className="mt-2 rounded-lg border border-border bg-muted/40 p-4"
          />
        )}

        <div className="mt-4">
          {q.type === "SINGLE_CHOICE" && (
            <div className="flex flex-col gap-2">
              {(q.options ?? []).map((o) => {
                const active = choiceValue === o.key;
                return (
                  <label
                    key={o.key}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors ${
                      active
                        ? "border-primary bg-primary-subtle"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`preview-${q.type}-${q.index}`}
                      checked={active}
                      onChange={() => setChoiceValue(o.key)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="num font-medium">{o.key}.</span> {o.text}
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          {(q.type === "FILL_BLANK" || q.type === "CODE_BLANK") && (
            <div className="flex flex-col gap-2">
              {Array.from({ length: blanks }).map((_, i) => {
                const v = fillValues[i] ?? "";
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="num w-14 shrink-0 text-xs text-muted-foreground">
                      空 {i + 1}
                    </span>
                    <input
                      value={v}
                      onChange={(e) => {
                        const next = [...fillValues];
                        while (next.length < blanks) next.push("");
                        next[i] = e.target.value;
                        setFillValues(next);
                      }}
                      className="h-9 flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                      placeholder="请输入答案"
                    />
                  </div>
                );
              })}
            </div>
          )}

          {q.type === "PROGRAMMING" && (
            <CodeEditor
              value={code}
              onChange={setCode}
              language="python"
              height={300}
              minLines={14}
              aria-label="Python 代码编辑器"
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
