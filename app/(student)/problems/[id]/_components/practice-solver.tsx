"use client";

import * as React from "react";
import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Play,
  Send,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "lucide-react";
import {
  submitForPracticeAction,
  runSamplePracticeAction,
} from "@/app/(student)/problems/actions";
import { usePollSubmission } from "@/hooks/use-poll-submission";
import { CodeEditor } from "@/components/code-editor";
import type { JudgeRunResult } from "@/lib/judge/local";

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "default"> = {
  ACCEPTED: "success",
  WRONG_ANSWER: "warning",
  TLE: "danger",
  MLE: "danger",
  RUNTIME_ERROR: "danger",
  COMPILE_ERROR: "danger",
  SYSTEM_ERROR: "danger",
  PENDING: "default",
  JUDGING: "default",
};

const STATUS_LABEL: Record<string, string> = {
  ACCEPTED: "通过",
  WRONG_ANSWER: "答案错误",
  TLE: "运行超时",
  MLE: "内存超限",
  RUNTIME_ERROR: "运行错误",
  COMPILE_ERROR: "编译错误",
  SYSTEM_ERROR: "系统异常",
};

interface JudgeCaseView {
  order: number;
  isSample: boolean;
  status: string;
  timeMs: number;
  actualOutput?: string;
  errorMsg?: string;
}

export function PracticeSolver({
  problemId,
  starterCode,
  lastCode,
  lastResult,
  maxScore,
}: {
  problemId: string;
  starterCode: string | null;
  lastCode: string | null;
  lastResult: JudgeResultSummary | null;
  maxScore: number;
}) {
  const [code, setCode] = React.useState(lastCode ?? starterCode ?? "");
  const [state, formAction, pending] = useActionState(submitForPracticeAction, undefined);
  const router = useRouter();

  // 运行样例：不进队列，不写 Submission
  const [sampleRunning, startSampleTransition] = useTransition();
  const [sampleResult, setSampleResult] = React.useState<JudgeRunResult | null>(null);
  const [sampleError, setSampleError] = React.useState<string | null>(null);

  function handleRunSample() {
    setSampleError(null);
    startSampleTransition(async () => {
      const res = await runSamplePracticeAction({ problemId, code });
      if (res.ok) {
        setSampleResult(res.result);
      } else {
        setSampleError(res.error ?? "运行失败");
        setSampleResult(null);
      }
    });
  }

  // 异步评测：拿到 submissionId 后开始轮询 /api/submissions/[id]
  const submissionId: string | null =
    state && state.ok && state.submissionId ? state.submissionId : null;
  const poll = usePollSubmission(submissionId);

  const polled = poll.kind === "done" ? poll.submission : null;
  const result: JudgeResultSummary | null = polled
    ? {
        submissionId: polled.id,
        status: polled.status,
        passedCount: polled.passedCount,
        totalCount: polled.totalCount,
        score: polled.score,
        timeMs: polled.maxTimeMs ?? 0,
        cases: polled.cases.map<JudgeCaseView>((c) => ({
          order: c.order,
          isSample: c.isSample,
          status: c.status,
          timeMs: c.timeMs,
          actualOutput: c.actualOutput,
          errorMsg: c.errorMsg,
        })),
      }
    : lastResult;

  // 终态拿到分数后刷新服务端数据（拿到最新 lastResult）
  React.useEffect(() => {
    if (poll.kind === "done") router.refresh();
  }, [poll.kind, router]);

  const tone = result ? (STATUS_TONE[result.status] ?? "default") : "default";
  const isPolling =
    submissionId !== null && (poll.kind === "loading" || poll.kind === "polling");

  return (
    <Card>
      <CardContent className="p-6">
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="problemId" value={problemId} />
          <input type="hidden" name="code" value={code} />

          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-medium text-muted-foreground">你的代码（Python 3）</span>
              <span className="num text-subtle-foreground">{code.length} 字符</span>
            </div>
            <CodeEditor
              value={code}
              onChange={setCode}
              language="python"
              height={400}
              minLines={20}
              aria-label="Python 代码编辑器"
            />
          </div>
          {state?.error && (
            <div className="rounded-lg border border-danger/30 bg-danger-subtle/40 px-3 py-2 text-xs text-danger">
              {state.error}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-subtle-foreground">
              提交后将跑全部用例。隐藏用例的实际输出不展示。
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRunSample}
                disabled={sampleRunning || pending || isPolling || !code.trim()}
              >
                {sampleRunning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                {sampleRunning ? "运行中…" : "运行样例"}
              </Button>
              <Button type="submit" disabled={pending || isPolling || !code.trim()} size="sm">
                <Send className="h-3.5 w-3.5" />
                {pending || isPolling ? "评测中…" : "提交评测"}
              </Button>
            </div>
          </div>
        </form>

        {sampleError && (
          <div className="mt-3 rounded-lg border border-danger/30 bg-danger-subtle/40 px-3 py-2 text-xs text-danger">
            {sampleError}
          </div>
        )}

        {sampleResult && <SampleResultPanel result={sampleResult} />}

        {result && (
          <div className="mt-4 rounded-lg border border-border bg-muted/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {tone === "success" ? (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                ) : tone === "warning" ? (
                  <XCircle className="h-4 w-4 text-warning" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-danger" />
                )}
                <Badge variant={tone}>{STATUS_LABEL[result.status] ?? result.status}</Badge>
                <span className="num text-xs text-muted-foreground">
                  通过 <b className="text-foreground">{result.passedCount}</b> /{" "}
                  {result.totalCount} 个用例
                </span>
                <span className="num text-xs text-muted-foreground">
                  · 得分 <b className="text-foreground">{result.score}</b> / {maxScore}
                </span>
              </div>
              <span className="num text-xs text-muted-foreground">
                用时 {result.timeMs}ms
              </span>
            </div>

            {isPolling && (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>评测中（已轮询 {poll.kind === "polling" ? poll.attempt : 0} 次 / 最多 60 次）…</span>
              </div>
            )}

            {poll.kind === "timeout" && (
              <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning-subtle/40 px-3 py-2 text-xs text-warning">
                <span>评测尚未完成（已轮询 {poll.attempts} 次），请稍后刷新页面查看结果。</span>
                <Button size="sm" variant="outline" onClick={() => router.refresh()}>
                  刷新
                </Button>
              </div>
            )}

            {poll.kind === "error" && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-danger/30 bg-danger-subtle/40 px-3 py-2 text-xs text-danger">
                <AlertCircle className="h-3 w-3" />
                <span>轮询失败：{poll.message}</span>
              </div>
            )}

            {result.cases.some((c) => c.isSample) && (
              <CaseDetails cases={result.cases} />
            )}

            <div className="mt-3 rounded-lg border border-dashed border-border bg-card/60 p-3 text-xs text-muted-foreground">
              <span>隐藏用例的实际输出不在此处展示。结果以整体通过率为准。</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export interface JudgeResultSummary {
  submissionId: string;
  status: string;
  passedCount: number;
  totalCount: number;
  score: number;
  timeMs: number;
  cases: JudgeCaseView[];
}

function CaseDetails({ cases }: { cases: JudgeCaseView[] }) {
  const [open, setOpen] = React.useState(false);
  const sampleCases = cases.filter((c) => c.isSample);
  if (sampleCases.length === 0) return null;

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <span>查看样例运行详情</span>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {sampleCases.map((c, i) => (
            <div
              key={i}
              className={`rounded-md border p-3 text-xs ${
                c.status === "ACCEPTED"
                  ? "border-success/30 bg-success-subtle/30"
                  : "border-danger/30 bg-danger-subtle/30"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="num font-mono text-[11px] text-muted-foreground">
                    样例 #{i + 1}
                  </span>
                  <Badge variant={STATUS_TONE[c.status] ?? "default"}>
                    {STATUS_LABEL[c.status] ?? c.status}
                  </Badge>
                  <span className="num text-muted-foreground">
                    <Clock className="mr-0.5 inline h-3 w-3" />
                    {c.timeMs}ms
                  </span>
                </div>
              </div>
              {c.errorMsg && (
                <div className="mt-2 rounded bg-card/80 px-2 py-1.5 font-mono text-[11px] text-danger">
                  {c.errorMsg}
                </div>
              )}
              <pre className="mt-2 overflow-x-auto whitespace-pre rounded bg-card/80 px-2 py-1.5 font-mono text-[11px] text-foreground">
                {c.actualOutput ?? "（无输出）"}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SampleResultPanel({ result }: { result: JudgeRunResult }) {
  const tone = STATUS_TONE[result.status] ?? "default";
  const label = STATUS_LABEL[result.status] ?? result.status;
  return (
    <div className="mt-4 rounded-lg border border-accent/30 bg-accent-subtle/30 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {tone === "success" ? (
          <CheckCircle2 className="h-4 w-4 text-success" />
        ) : tone === "warning" ? (
          <XCircle className="h-4 w-4 text-warning" />
        ) : (
          <AlertCircle className="h-4 w-4 text-danger" />
        )}
        <span className="text-xs font-medium text-muted-foreground">样例运行</span>
        <Badge variant={tone}>{label}</Badge>
        <span className="num text-xs text-muted-foreground">
          通过 <b className="text-foreground">{result.passedCount}</b> / {result.totalCount}{" "}
          个样例
        </span>
      </div>
      <details className="mt-3" open>
        <summary className="cursor-pointer select-none text-xs text-muted-foreground hover:text-foreground">
          查看样例运行详情
        </summary>
        <div className="mt-2 space-y-2">
          {result.cases.map((c, i) => (
            <div
              key={i}
              className={`rounded-md border p-3 text-xs ${
                c.status === "ACCEPTED"
                  ? "border-success/30 bg-success-subtle/30"
                  : "border-danger/30 bg-danger-subtle/30"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="num font-mono text-[11px] text-muted-foreground">
                    样例 #{i + 1}
                  </span>
                  <Badge variant={STATUS_TONE[c.status] ?? "default"}>
                    {STATUS_LABEL[c.status] ?? c.status}
                  </Badge>
                  <span className="num text-muted-foreground">
                    <Clock className="mr-0.5 inline h-3 w-3" />
                    {c.timeMs}ms
                  </span>
                </div>
              </div>
              {c.errorMsg && (
                <div className="mt-2 rounded bg-card/80 px-2 py-1.5 font-mono text-[11px] text-danger">
                  {c.errorMsg}
                </div>
              )}
              <pre className="mt-2 overflow-x-auto whitespace-pre rounded bg-card/80 px-2 py-1.5 font-mono text-[11px] text-foreground">
                {c.actualOutput ?? "（无输出）"}
              </pre>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
