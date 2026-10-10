"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, Check, CheckCircle2, Clock, Loader2, Play, XCircle } from "lucide-react";
import {
  runExamSampleAction,
  saveAnswerAction,
  submitExamAction,
  type ExamSampleResult,
} from "@/app/(student)/exams/actions";
import type { Difficulty, QuestionType } from "@prisma/client";
import { CodeEditor } from "@/components/code-editor";
import { MarkdownContent } from "@/components/markdown-content";

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
  serverNow,
  questions,
}: {
  attemptId: string;
  examTitle: string;
  totalScore: number;
  deadlineAt: string;
  serverNow: string;
  questions: Q[];
}) {
  const deadline = useMemo(() => new Date(deadlineAt).getTime(), [deadlineAt]);
  const [remain, setRemain] = useState(() => Math.max(0, deadline - new Date(serverNow).getTime()));
  const [answers, setAnswers] = useState<Record<string, unknown>>(() => {
    const m: Record<string, unknown> = {};
    for (const q of questions)
      if (q.saved !== null && q.saved !== undefined) m[q.questionId] = q.saved;
    return m;
  });
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitting, startSubmit] = useTransition();
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const submittedRef = useRef(false);
  const dirty = useRef<Record<string, unknown>>({});
  const inFlight = useRef<Promise<boolean> | null>(null);
  const storageKey = `exam-pending:${attemptId}`;

  const flush = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) return inFlight.current;
    const run = async () => {
      while (Object.keys(dirty.current).length) {
        if (!navigator.onLine) {
          setSaveState("error");
          setSaveError("网络已断开，答案暂存在本机");
          return false;
        }
        const [questionId, value] = Object.entries(dirty.current)[0];
        setSaveState("saving");
        const fd = new FormData();
        fd.set("attemptId", attemptId);
        fd.set("questionId", questionId);
        fd.set("content", JSON.stringify(value));
        try {
          const res = await saveAnswerAction(undefined, fd);
          if (!res.ok) {
            setSaveState("error");
            setSaveError(res.error ?? "保存失败");
            return false;
          }
        } catch {
          setSaveState("error");
          setSaveError("保存失败，答案暂存在本机");
          return false;
        }
        if (dirty.current[questionId] === value) delete dirty.current[questionId];
        try {
          localStorage.setItem(storageKey, JSON.stringify(dirty.current));
        } catch {
          /* storage unavailable */
        }
      }
      setSaveState("saved");
      setSaveError(null);
      return true;
    };
    inFlight.current = run();
    try {
      return await inFlight.current;
    } finally {
      inFlight.current = null;
    }
  }, [attemptId, storageKey]);

  useEffect(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
      if (cached && typeof cached === "object" && !Array.isArray(cached)) {
        const allowed = new Set(questions.map((q) => q.questionId));
        for (const [id, value] of Object.entries(cached))
          if (allowed.has(id)) dirty.current[id] = value;
        setAnswers((prev) => ({ ...prev, ...dirty.current }));
        if (Object.keys(dirty.current).length) void flush();
      }
    } catch {
      /* malformed or unavailable local storage */
    }
    const retry = setInterval(() => {
      if (Object.keys(dirty.current).length) void flush();
    }, 15000);
    const online = () => {
      void flush();
    };
    window.addEventListener("online", online);
    return () => {
      clearInterval(retry);
      window.removeEventListener("online", online);
    };
  }, [flush, questions, storageKey]);

  const doSubmit = useCallback(() => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    startSubmit(async () => {
      const saved = await flush();
      if (!saved) {
        submittedRef.current = false;
        setConfirming(true);
        return;
      }
      const fd = new FormData();
      fd.set("attemptId", attemptId);
      const res = await submitExamAction(undefined, fd);
      if (res?.error) {
        submittedRef.current = false;
        setSaveError(res.error);
      }
    });
  }, [attemptId, flush]);

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
      dirty.current[questionId] = value;
      try {
        localStorage.setItem(storageKey, JSON.stringify(dirty.current));
      } catch {
        setSaveError("本地存储不可用，请保持网络连接");
      }
      setSaveState("saving");
      timers.current[questionId] = setTimeout(() => {
        void flush();
      }, 600);
    },
    [flush, storageKey],
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
    <main className="flex-1">
      <div className="sticky top-16 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-14 max-w-[1180px] items-center gap-4 px-8">
          <div className="flex min-w-0 items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span
              className={`num text-2xl font-bold tracking-tight ${
                urgent ? "text-danger" : "text-foreground"
              }`}
              aria-live="polite"
            >
              {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
            </span>
            {urgent && <span className="hidden text-xs text-danger sm:inline">不足 5 分钟</span>}
          </div>
          <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">
            已答 <span className="num text-foreground">{answeredCount}</span>
            <span className="num"> / {questions.length}</span>
          </span>
          <Button size="sm" onClick={() => setConfirming(true)} disabled={submitting}>
            交卷
          </Button>
        </div>
      </div>

      <div className="mx-auto flex max-w-[1180px] gap-6 p-8">
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
              attemptId={attemptId}
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
                  className={`num mt-2 text-4xl font-bold tracking-tight ${
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
                    {(() => {
                      const unanswered = questions
                        .filter((q) => {
                          const v = answers[q.questionId];
                          const done = Array.isArray(v)
                            ? v.some((x) => String(x ?? "").trim() !== "")
                            : v !== undefined && v !== null && v !== "";
                          return !done;
                        })
                        .map((q) => q.index);
                      if (unanswered.length === 0) return null;
                      return (
                        <div className="rounded-lg border border-warning/30 bg-warning-subtle/40 p-2 text-xs text-warning">
                          <p className="mb-1 font-medium">
                            有 <span className="num">{unanswered.length}</span> 题未作答：
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {unanswered.map((i) => (
                              <a
                                key={i}
                                href={`#q-${i}`}
                                onClick={() => setConfirming(false)}
                                className="num inline-flex h-6 min-w-6 items-center justify-center rounded border border-warning/40 bg-card px-1.5 text-[11px] text-warning hover:bg-warning-subtle"
                              >
                                {i}
                              </a>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
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
  attemptId,
  q,
  value,
  onChange,
}: {
  attemptId: string;
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
            <ProgrammingAnswer
              attemptId={attemptId}
              questionId={q.questionId}
              initialCode={q.problem?.starterCode ?? ""}
              value={value}
              onChange={onChange}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ProgrammingAnswer({
  attemptId,
  questionId,
  initialCode,
  value,
  onChange,
}: {
  attemptId: string;
  questionId: string;
  initialCode: string;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const code = typeof value === "string" ? value : initialCode;
  const [running, startRun] = useTransition();
  const [result, setResult] = useState<ExamSampleResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function runSamples() {
    setError(null);
    setResult(null);
    startRun(async () => {
      const response = await runExamSampleAction({ attemptId, questionId, code });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setResult(response.result);
    });
  }

  return (
    <div>
      <CodeEditor
        value={code}
        onChange={onChange}
        language="python"
        height={320}
        minLines={14}
        aria-label="Python 代码编辑器"
      />
      <div className="mt-3 flex items-center gap-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={running || !code.trim()}
          onClick={runSamples}
        >
          {running ? <Loader2 className="animate-spin" /> : <Play />}
          {running ? "运行中…" : "运行全部样例"}
        </Button>
        <span className="text-xs text-muted-foreground">一次运行本题全部公开测试点</span>
      </div>
      {error && (
        <div className="mt-3 rounded-md border border-danger/30 bg-danger-subtle/40 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}
      {result && <ExamSampleResultPanel result={result} />}
    </div>
  );
}

const SAMPLE_STATUS_LABEL: Record<string, string> = {
  ACCEPTED: "通过",
  WRONG_ANSWER: "答案错误",
  TLE: "超时",
  MLE: "内存超限",
  RUNTIME_ERROR: "运行错误",
  COMPILE_ERROR: "语法错误",
  SYSTEM_ERROR: "系统错误",
};

function ExamSampleResultPanel({ result }: { result: ExamSampleResult }) {
  const allPassed = result.passedCount === result.totalCount;
  return (
    <div className={`mt-4 rounded-lg border p-4 ${allPassed ? "border-success/30 bg-success-subtle/30" : "border-danger/30 bg-danger-subtle/20"}`}>
      <div className="flex flex-wrap items-center gap-2">
        {allPassed ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-danger" />}
        <span className="text-sm font-medium">样例运行结果</span>
        <Badge variant={allPassed ? "success" : "danger"}>
          通过 {result.passedCount}/{result.totalCount}
        </Badge>
      </div>
      <div className="mt-3 space-y-2">
        {result.cases.map((testCase, index) => (
          <details key={index} className="rounded-md border border-border bg-card p-3" open={testCase.status !== "ACCEPTED"}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs">
              <span className="font-medium">测试点 {index + 1}</span>
              <span className={testCase.status === "ACCEPTED" ? "text-success" : "text-danger"}>
                {SAMPLE_STATUS_LABEL[testCase.status] ?? testCase.status} · {testCase.timeMs}ms
              </span>
            </summary>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <SampleOutput label="输入" value={testCase.input} />
              <SampleOutput label="期望输出" value={testCase.expected} />
              <SampleOutput label="实际输出" value={testCase.actualOutput ?? testCase.errorMsg ?? "（无输出）"} danger={testCase.status !== "ACCEPTED"} />
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function SampleOutput({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[11px] text-muted-foreground">{label}</div>
      <pre className={`min-h-16 overflow-x-auto whitespace-pre-wrap rounded-md bg-muted/50 p-2 font-mono text-xs ${danger ? "text-danger" : "text-foreground"}`}>
        {value || "（空）"}
      </pre>
    </div>
  );
}

const TYPE_LABEL: Record<QuestionType, string> = {
  SINGLE_CHOICE: "单选题",
  FILL_BLANK: "填空题",
  CODE_BLANK: "代码填空",
  PROGRAMMING: "编程题",
};
