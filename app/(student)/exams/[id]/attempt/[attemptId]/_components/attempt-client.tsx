"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, Check, Clock, Loader2 } from "lucide-react";
import { saveAnswerAction, submitExamAction } from "@/app/(student)/exams/actions";
import type { Difficulty, QuestionType } from "@prisma/client";
import { CodeEditor } from "@/components/code-editor";

type Q = {
  index: number;
  questionId: string;
  type: QuestionType;
  content: string;
  difficulty: Difficulty;
  score: number;
  options: { key: string; text: string }[] | null;
  problem: { id: string; title: string; description: string; starterCode: string } | null;
  saved: unknown;
};

type SaveState = "idle" | "saving" | "saved" | "error";

export function AttemptClient({
  attemptId,
  examTitle,
  totalScore,
  deadlineAt,
  questions,
}: {
  attemptId: string;
  examTitle: string;
  totalScore: number;
  deadlineAt: string;
  questions: Q[];
}) {
  const deadline = useMemo(() => new Date(deadlineAt).getTime(), [deadlineAt]);
  const [remain, setRemain] = useState(() => Math.max(0, deadline - Date.now()));
  const [answers, setAnswers] = useState<Record<string, unknown>>(() => {
    const m: Record<string, unknown> = {};
    for (const q of questions) if (q.saved !== null && q.saved !== undefined) m[q.questionId] = q.saved;
    return m;
  });
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitting, startSubmit] = useTransition();
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const submittedRef = useRef(false);

  const doSubmit = useCallback(() => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    startSubmit(async () => {
      const fd = new FormData();
      fd.set("attemptId", attemptId);
      const res = await submitExamAction(undefined, fd);
      if (res?.error) {
        submittedRef.current = false;
        setSaveError(res.error);
      }
    });
  }, [attemptId]);

  useEffect(() => {
    const t = setInterval(() => {
      const left = Math.max(0, deadline - Date.now());
      setRemain(left);
      if (left === 0) doSubmit();
    }, 1000);
    return () => clearInterval(t);
  }, [deadline, doSubmit]);

  const save = useCallback(
    (questionId: string, value: unknown) => {
      clearTimeout(timers.current[questionId]);
      timers.current[questionId] = setTimeout(async () => {
        setSaveState("saving");
        const fd = new FormData();
        fd.set("attemptId", attemptId);
        fd.set("questionId", questionId);
        fd.set("content", JSON.stringify(value));
        const res = await saveAnswerAction(undefined, fd);
        if (res.ok) {
          setSaveState("saved");
          setSaveError(null);
        } else {
          setSaveState("error");
          setSaveError(res.error ?? "保存失败");
        }
      }, 600);
    },
    [attemptId],
  );

  const setAnswer = useCallback(
    (questionId: string, value: unknown) => {
      setAnswers((prev) => ({ ...prev, [questionId]: value }));
      save(questionId, value);
    },
    [save],
  );

  const answeredCount = questions.filter((q) => {
    const v = answers[q.questionId];
    if (v === undefined || v === null || v === "") return false;
    if (Array.isArray(v)) return v.some((x) => String(x ?? "").trim() !== "");
    return true;
  }).length;

  const mm = Math.floor(remain / 60000);
  const ss = Math.floor((remain % 60000) / 1000);
  const urgent = remain < 5 * 60 * 1000;

  return (
    <main className="flex-1 p-8">
      <div className="mx-auto flex max-w-[1180px] gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{examTitle}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              共 <span className="num">{questions.length}</span> 题 ·{" "}
              <span className="num">{totalScore}</span> 分。答案自动保存。
            </p>
          </div>

          {questions.map((q) => (
            <QuestionCard
              key={q.questionId}
              q={q}
              value={answers[q.questionId]}
              onChange={(v) => setAnswer(q.questionId, v)}
            />
          ))}

          {questions.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <AlertCircle className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">本场考试尚未添加题目</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* 侧栏 */}
        <aside className="hidden w-[260px] shrink-0 lg:block">
          <div className="sticky top-6 flex flex-col gap-4">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  剩余时间
                </div>
                <div
                  className={`mt-2 num text-4xl font-bold tracking-tight ${
                    urgent ? "text-danger" : "text-foreground"
                  }`}
                >
                  {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
                </div>
                {urgent && (
                  <p className="mt-2 text-xs text-danger">时间不足 5 分钟，请尽快交卷。</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>答题进度</span>
                  <span className="num">
                    {answeredCount}/{questions.length}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-5 gap-2">
                  {questions.map((q) => {
                    const v = answers[q.questionId];
                    const done = Array.isArray(v)
                      ? v.some((x) => String(x ?? "").trim() !== "")
                      : v !== undefined && v !== null && v !== "";
                    return (
                      <a
                        key={q.questionId}
                        href={`#q-${q.index}`}
                        className={`num flex h-8 items-center justify-center rounded-md border text-xs transition-colors ${
                          done
                            ? "border-primary bg-primary-subtle font-medium text-primary"
                            : "border-border text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {q.index}
                      </a>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex flex-col gap-3 p-5">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {saveState === "saving" ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      正在保存…
                    </>
                  ) : saveState === "saved" ? (
                    <>
                      <Check className="h-3 w-3 text-success" />
                      已保存
                    </>
                  ) : saveState === "error" ? (
                    <>
                      <AlertCircle className="h-3 w-3 text-danger" />
                      <span className="text-danger">{saveError}</span>
                    </>
                  ) : (
                    "答案将自动保存"
                  )}
                </div>
                {confirming ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-muted-foreground">
                      交卷后无法再修改答案，确认提交？
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={doSubmit} disabled={submitting}>
                        {submitting ? "提交中…" : "确认交卷"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirming(false)}
                        disabled={submitting}
                      >
                        取消
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button onClick={() => setConfirming(true)} disabled={submitting}>
                    交卷
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </aside>
      </div>
    </main>
  );
}

function blankCount(content: string) {
  const m = content.match(/\{\{\s*\d+\s*\}\}/g);
  return m ? m.length : 1;
}

function QuestionCard({
  q,
  value,
  onChange,
}: {
  q: Q;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  return (
    <Card id={`q-${q.index}`} className="scroll-mt-6">
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="num text-sm font-semibold text-primary">第 {q.index} 题</span>
            <Badge variant="default">{TYPE_LABEL[q.type]}</Badge>
          </div>
          <span className="num shrink-0 text-xs text-muted-foreground">{q.score} 分</span>
        </div>

        <p className="mt-3 whitespace-pre-line text-sm text-foreground">
          {q.type === "PROGRAMMING" && q.problem ? q.problem.title : q.content}
        </p>

        {q.type === "PROGRAMMING" && q.problem && (
          <p className="mt-2 whitespace-pre-line rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            {q.problem.description}
          </p>
        )}

        <div className="mt-4">
          {q.type === "SINGLE_CHOICE" && (
            <div className="flex flex-col gap-2">
              {(q.options ?? []).map((o) => {
                const active = value === o.key;
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
                      name={`q-${q.questionId}`}
                      checked={active}
                      onChange={() => onChange(o.key)}
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
              {Array.from({ length: blankCount(q.content) }).map((_, i) => {
                const arr = Array.isArray(value) ? (value as string[]) : [];
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="num w-14 shrink-0 text-xs text-muted-foreground">
                      空 {i + 1}
                    </span>
                    <input
                      value={arr[i] ?? ""}
                      onChange={(e) => {
                        const next = [...arr];
                        while (next.length < blankCount(q.content)) next.push("");
                        next[i] = e.target.value;
                        onChange(next);
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
              value={typeof value === "string" ? value : (q.problem?.starterCode ?? "")}
              onChange={(v) => onChange(v)}
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

const TYPE_LABEL: Record<QuestionType, string> = {
  SINGLE_CHOICE: "单选题",
  FILL_BLANK: "填空题",
  CODE_BLANK: "代码填空",
  PROGRAMMING: "编程题",
};
