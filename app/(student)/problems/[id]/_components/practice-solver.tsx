"use client";

import * as React from "react";
import { useActionState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Send,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { submitForPracticeAction } from "@/app/(student)/problems/actions";

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

  const result: JudgeResultSummary | null = state?.judge
    ? {
        submissionId: state.judge.submissionId,
        status: state.judge.status,
        passedCount: state.judge.passedCount,
        totalCount: state.judge.totalCount,
        score: state.judge.autoScore,
        timeMs: state.judge.timeMs,
        cases: state.judge.cases,
      }
    : lastResult;

  const tone = result ? (STATUS_TONE[result.status] ?? "default") : "default";

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
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              placeholder="# 在此输入你的代码"
              rows={20}
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
              提交后将跑全部用例。隐藏用例的实际输出不展示。
            </p>
            <Button type="submit" disabled={pending || !code.trim()} size="sm">
              <Send className="h-3.5 w-3.5" />
              {pending ? "评测中…" : "提交评测"}
            </Button>
          </div>
        </form>

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
