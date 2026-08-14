"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Send,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Code2,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "lucide-react";
import type { Difficulty } from "@prisma/client";
import { submitProblemAction } from "@/app/(student)/assignments/actions";
import { usePollSubmission } from "@/hooks/use-poll-submission";

const DIFFICULTY_LABELS: Record<Difficulty, { label: string; tone: "success" | "warning" | "danger" }> = {
  EASY: { label: "入门", tone: "success" },
  MEDIUM: { label: "中等", tone: "warning" },
  HARD: { label: "进阶", tone: "danger" },
};

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "default"> = {
  ACCEPTED: "success",
  WRONG_ANSWER: "warning",
  TLE: "danger",
  MLE: "danger",
  RUNTIME_ERROR: "danger",
  COMPILE_ERROR: "danger",
  SYSTEM_ERROR: "danger",
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

interface Sample {
  input: string;
  expected: string;
}

interface Problem {
  id: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  tags: string[];
  starterCode: string | null;
  testCaseCount: number;
  timeLimitMs: number;
  memoryLimitMb: number;
  samples: Sample[];
  score: number;
}

interface JudgeCaseView {
  order: number;
  isSample: boolean;
  status: string;
  timeMs: number;
  actualOutput?: string;
  errorMsg?: string;
}

interface LastResult {
  status: string;
  passedCount: number;
  totalCount: number;
  autoScore: number;
  cases: JudgeCaseView[];
}

export function ProblemSubmit({
  assignmentId,
  myTotalScore,
  totalScore,
  problem,
  lastCode,
  lastResult,
}: {
  assignmentId: string;
  myTotalScore: number; // 学生当前累计自动分（含其他题）
  totalScore: number; // 作业总分
  problem: Problem;
  lastCode: string | null;
  lastResult: LastResult | null;
}) {
  const [code, setCode] = React.useState(lastCode ?? problem.starterCode ?? "");
  const [state, formAction, pending] = useActionState(submitProblemAction, undefined);
  const router = useRouter();

  // 异步评测：拿到 submissionId 后轮询 /api/submissions/[id]
  const submissionId: string | null =
    state && state.ok && state.submissionId ? state.submissionId : null;
  const poll = usePollSubmission(submissionId);

  const polled = poll.kind === "done" ? poll.submission : null;
  const result: LastResult | null = polled
    ? {
        status: polled.status,
        passedCount: polled.passedCount,
        totalCount: polled.totalCount,
        autoScore: polled.score,
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

  // 拿到终态后刷新服务端数据（最新 myTotalScore + lastResult）
  React.useEffect(() => {
    if (poll.kind === "done") router.refresh();
  }, [poll.kind, router]);

  const tone = result ? (STATUS_TONE[result.status] ?? "default") : "default";
  const isPolling =
    submissionId !== null && (poll.kind === "loading" || poll.kind === "polling");

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-primary" />
              <h3 className="text-base font-semibold text-foreground">{problem.title}</h3>
              <Badge variant={DIFFICULTY_LABELS[problem.difficulty].tone} className="font-normal">
                {DIFFICULTY_LABELS[problem.difficulty].label}
              </Badge>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="num">分值 {problem.score}</span>
              <span>·</span>
              <span className="num">{problem.testCaseCount} 个用例</span>
              <span>·</span>
              <span className="num">
                {problem.timeLimitMs}ms / {problem.memoryLimitMb}MB
              </span>
              {problem.tags.length > 0 && (
                <>
                  <span>·</span>
                  <span>{problem.tags.slice(0, 4).join(" · ")}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {problem.description.trim() && (
          <div className="mt-4 whitespace-pre-line rounded-lg border border-border bg-muted/40 p-4 text-sm leading-relaxed text-foreground">
            {problem.description}
          </div>
        )}

        {problem.samples.length > 0 && (
          <div className="mt-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground">样例输入输出</p>
            {problem.samples.map((s, i) => (
              <div key={i} className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-2">
                <div>
                  <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    输入 #{i + 1}
                  </div>
                  <pre className="overflow-x-auto whitespace-pre rounded bg-muted/60 px-2.5 py-2 font-mono text-xs text-foreground">
                    {s.input || "（空）"}
                  </pre>
                </div>
                <div>
                  <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    期望输出 #{i + 1}
                  </div>
                  <pre className="overflow-x-auto whitespace-pre rounded bg-muted/60 px-2.5 py-2 font-mono text-xs text-foreground">
                    {s.expected || "（空）"}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        )}

        <form action={formAction} className="mt-4 space-y-3">
          <input type="hidden" name="assignmentId" value={assignmentId} />
          <input type="hidden" name="problemId" value={problem.id} />
          <input type="hidden" name="code" value={code} />
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-medium text-muted-foreground">你的代码（Python 3）</span>
              <span className="num text-subtle-foreground">{code.length} 字符</span>
            </div>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              placeholder="# 在此输入你的代码"
              rows={14}
              className="block w-full rounded-lg border border-border bg-muted/30 px-3 py-2.5 font-mono text-[13px] leading-relaxed text-foreground focus:border-primary focus:bg-card focus:outline-none"
              style={{ tabSize: 4 }}
            />
          </div>
          {state?.error && (
            <div className="rounded-lg border border-danger/30 bg-danger-subtle/40 px-3 py-2 text-xs text-danger">
              {state.error}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-subtle-foreground">
              提交后将自动跑全部用例（含隐藏用例），隐藏用例的实际输出不会展示。
            </p>
            <Button type="submit" disabled={pending || isPolling || !code.trim()} size="sm">
              <Send className="h-3.5 w-3.5" />
              {pending || isPolling ? "评测中…" : "提交评测"}
            </Button>
          </div>
        </form>

        {result && (
          <div className="mt-4 rounded-lg border border-border bg-muted/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {tone === "success" ? (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                ) : tone === "warning" ? (
                  <XCircle className="h-4 w-4 text-warning" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-danger" />
                )}
                <Badge variant={tone}>{STATUS_LABEL[result.status] ?? result.status}</Badge>
                <span className="num text-xs text-muted-foreground">
                  通过 <b className="text-foreground">{result.passedCount}</b> / {result.totalCount} 个用例
                </span>
                <span className="num text-xs text-muted-foreground">
                  · 本题得分 <b className="text-foreground">{result.autoScore}</b> / {problem.score}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                累计 <span className="num font-medium text-foreground">{myTotalScore}</span> /{" "}
                {totalScore}
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

            {/* 仅展示样例明细，不暴露隐藏用例的实际输出 */}
            {result.cases.some((c) => c.isSample) && (
              <CaseDetails cases={result.cases} />
            )}

            {/* 隐藏用例摘要：仅数量 + 通过率，不暴露细节 */}
            <div className="mt-3 rounded-lg border border-dashed border-border bg-card/60 p-3 text-xs text-muted-foreground">
              <span>隐藏用例的实际输出不在此处展示。结果以整体通过率为准。</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
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
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
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
