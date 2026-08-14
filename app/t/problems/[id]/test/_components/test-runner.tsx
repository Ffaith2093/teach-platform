"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  PlayCircle,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  RotateCw,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { runProblemTestsAction, type RunResult } from "@/app/t/problems/actions";

interface TestCase {
  id: string;
  order: number;
  isSample: boolean;
  input: string;
  expected: string;
  score: number;
}

type CaseStatus =
  | "ACCEPTED"
  | "WRONG_ANSWER"
  | "TLE"
  | "MLE"
  | "RUNTIME_ERROR"
  | "COMPILE_ERROR"
  | "SYSTEM_ERROR";

interface CaseResult {
  testCaseId: string | null;
  order: number;
  isSample: boolean;
  status: CaseStatus;
  timeMs: number;
  actualOutput?: string;
  errorMsg?: string;
}

const STATUS_TONE: Record<CaseStatus, { label: string; class: string; bgClass: string }> = {
  ACCEPTED: {
    label: "通过",
    class: "text-success",
    bgClass: "bg-success-subtle text-success",
  },
  WRONG_ANSWER: {
    label: "答案错误",
    class: "text-danger",
    bgClass: "bg-danger-subtle text-danger",
  },
  TLE: {
    label: "超时",
    class: "text-warning",
    bgClass: "bg-warning-subtle text-warning",
  },
  MLE: {
    label: "超内存",
    class: "text-warning",
    bgClass: "bg-warning-subtle text-warning",
  },
  RUNTIME_ERROR: {
    label: "运行错误",
    class: "text-danger",
    bgClass: "bg-danger-subtle text-danger",
  },
  COMPILE_ERROR: {
    label: "编译错误",
    class: "text-danger",
    bgClass: "bg-danger-subtle text-danger",
  },
  SYSTEM_ERROR: {
    label: "系统错误",
    class: "text-muted-foreground",
    bgClass: "bg-muted text-muted-foreground",
  },
};

export function TestRunner({
  problemId,
  initialTestCases,
  hasRef,
}: {
  problemId: string;
  initialTestCases: TestCase[];
  hasRef: boolean;
}) {
  const [result, setResult] = React.useState<RunResult | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [expandedIdx, setExpandedIdx] = React.useState<number | null>(null);

  function handleRun() {
    if (!hasRef) return;
    startTransition(async () => {
      const r = await runProblemTestsAction(problemId);
      setResult(r);
      // 自动展开第一个失败
      const firstFail = r.cases.findIndex((c) => c.status !== "ACCEPTED");
      setExpandedIdx(firstFail >= 0 ? firstFail : 0);
    });
  }

  const passedCount = result?.passedCount ?? 0;
  const totalCount = result?.totalCount ?? initialTestCases.length;
  const allPass = result?.status === "ACCEPTED";
  const failCount = totalCount - passedCount;
  const maxTime = result?.maxTimeMs ?? 0;

  return (
    <div className="space-y-6">
      {/* 操作条 */}
      <Card>
        <CardContent className="flex items-center justify-between gap-4 p-5">
          <div>
            <h2 className="text-base font-semibold">评测结果</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              本地评测（dev 环境）。生产应使用 Docker 沙箱 + BullMQ 队列。
            </p>
          </div>
          <Button onClick={handleRun} disabled={pending || !hasRef}>
            {pending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <RotateCw />
            )}
            {pending ? "评测中…" : result ? "重新跑全部" : "运行全部用例"}
          </Button>
        </CardContent>
      </Card>

      {/* 整体结果 */}
      {result && (
        <Card
          className={
            allPass
              ? "border-success/40 bg-success-subtle/20"
              : "border-warning/40 bg-warning-subtle/20"
          }
        >
          <CardContent className="p-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="flex items-baseline gap-2">
                  <span
                    className={`text-4xl font-bold tracking-tight num ${
                      allPass ? "text-success" : "text-warning"
                    }`}
                  >
                    {passedCount} / {totalCount}
                  </span>
                  <span className="text-base text-muted-foreground">通过</span>
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  <span>
                    最长用时 <span className="num text-foreground">{maxTime}</span> ms
                  </span>
                  {failCount > 0 && (
                    <>
                      <span>·</span>
                      <span>
                        失败 <span className="num text-foreground">{failCount}</span> 个
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="rounded-lg bg-card px-4 py-3 text-xs">
                {allPass ? (
                  <div className="text-success">
                    <CheckCircle2 className="mr-1.5 inline h-4 w-4" />
                    全部通过，可挂载到作业
                  </div>
                ) : (
                  <div className="text-warning">
                    <AlertTriangle className="mr-1.5 inline h-4 w-4" />
                    有用例未通过，请修正参考答案或测试数据
                  </div>
                )}
              </div>
            </div>

            {/* 进度条 */}
            <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={`transition-all ${allPass ? "bg-success" : "bg-warning"}`}
                style={{
                  width: `${totalCount > 0 ? (passedCount / totalCount) * 100 : 0}%`,
                }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* 用例详情 */}
      <Card>
        <CardContent className="p-0">
          <div className="border-b border-border bg-muted/40 px-6 py-3">
            <h3 className="text-sm font-semibold">测试用例详情</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-xs font-medium text-muted-foreground">
                <th className="w-10 px-3 py-3"></th>
                <th className="px-3 py-3">#</th>
                <th className="px-3 py-3">类型</th>
                <th className="px-3 py-3">状态</th>
                <th className="px-3 py-3">用时</th>
                <th className="px-3 py-3">分值</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {initialTestCases.map((tc, idx) => {
                const r = result?.cases.find((c) => c.order === idx);
                const status: CaseStatus = r?.status ?? "SYSTEM_ERROR";
                const tone = STATUS_TONE[status];
                const expanded = expandedIdx === idx;
                return (
                  <React.Fragment key={tc.id}>
                    <tr
                      className={`cursor-pointer transition-colors hover:bg-muted/30 ${
                        r?.status && r.status !== "ACCEPTED" ? "bg-danger-subtle/20" : ""
                      }`}
                      onClick={() => setExpandedIdx(expanded ? null : idx)}
                    >
                      <td className="px-3 py-2.5">
                        {expanded ? (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </td>
                      <td className="px-3 py-2.5 num font-mono text-xs">#{idx + 1}</td>
                      <td className="px-3 py-2.5">
                        {tc.isSample ? (
                          <Badge variant="success" className="font-normal">
                            样例
                          </Badge>
                        ) : (
                          <Badge variant="default" className="font-normal">
                            隐藏
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {r ? (
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${tone.bgClass}`}
                          >
                            {tone.label}
                          </span>
                        ) : (
                          <span className="text-xs text-subtle-foreground">未运行</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs num text-muted-foreground">
                        {r ? <span>{r.timeMs} ms</span> : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-xs num">{tc.score}</td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={6} className="bg-muted/20 px-6 py-4">
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            <DiffPane label="输入" content={tc.input} />
                            <DiffPane
                              label="期望输出"
                              content={tc.expected}
                              tone="success"
                            />
                            <DiffPane
                              label="实际输出"
                              content={r?.actualOutput ?? "(空)"}
                              tone={r?.status === "ACCEPTED" ? "success" : "danger"}
                            />
                          </div>
                          {r?.errorMsg && (
                            <div className="mt-3 rounded-lg border border-danger/30 bg-danger-subtle/40 p-3">
                              <div className="text-xs font-medium text-danger">
                                错误信息
                              </div>
                              <pre className="mt-1 whitespace-pre-wrap font-mono text-xs text-foreground">
                                {r.errorMsg}
                              </pre>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          {initialTestCases.length === 0 && (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              该题还没有测试用例。请先在「编辑题目」中添加。
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DiffPane({
  label,
  content,
  tone,
}: {
  label: string;
  content: string;
  tone?: "success" | "danger";
}) {
  const borderClass =
    tone === "success"
      ? "border-success/30"
      : tone === "danger"
        ? "border-danger/30"
        : "border-border";
  return (
    <div className={`rounded-lg border ${borderClass} bg-card overflow-hidden`}>
      <div className="border-b border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground">
        {label}
      </div>
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all p-3 font-mono text-xs text-foreground">
        {content || "(空)"}
      </pre>
    </div>
  );
}