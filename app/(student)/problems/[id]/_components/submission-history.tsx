"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock,
  History,
  XCircle,
} from "lucide-react";

export interface SubmissionHistoryRow {
  id: string;
  status: string;
  passedCount: number;
  totalCount: number;
  score: number;
  maxTimeMs: number | null;
  createdAt: Date;
  code: string;
}

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
  PENDING: "评测中",
  JUDGING: "评测中",
};

function timeAgo(d: Date): string {
  const ms = Date.now() - new Date(d).getTime();
  if (ms < 60_000) return "刚刚";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(d).toLocaleDateString("zh-CN");
}

export function SubmissionHistory({ history }: { history: SubmissionHistoryRow[] }) {
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  if (history.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold">提交历史</span>
            <History className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <p className="py-6 text-center text-xs text-muted-foreground">还没有提交记录</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold">提交历史</span>
          <History className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <ul className="space-y-2">
          {history.map((h) => {
            const tone = STATUS_TONE[h.status] ?? "default";
            const open = expandedId === h.id;
            return (
              <li
                key={h.id}
                className={`rounded-md border ${
                  h.status === "ACCEPTED"
                    ? "border-success/30 bg-success-subtle/20"
                    : "border-border bg-card"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(open ? null : h.id)}
                  aria-expanded={open}
                  className="flex w-full items-center gap-2 rounded-md p-2 text-left text-xs transition-colors hover:bg-muted/40"
                >
                  {tone === "success" ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  ) : tone === "warning" ? (
                    <XCircle className="h-3.5 w-3.5 text-warning" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5 text-danger" />
                  )}
                  <Badge variant={tone}>{STATUS_LABEL[h.status] ?? h.status}</Badge>
                  <span className="num text-muted-foreground">
                    {h.passedCount}/{h.totalCount}
                  </span>
                  <span className="num text-muted-foreground">
                    <Clock className="mr-0.5 inline h-3 w-3" />
                    {h.maxTimeMs ?? 0}ms
                  </span>
                  <span className="ml-auto num text-muted-foreground">{timeAgo(h.createdAt)}</span>
                  <ChevronRight
                    className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
                      open ? "rotate-90" : ""
                    }`}
                  />
                </button>
                {open && (
                  <div className="border-t border-border bg-muted/20 px-3 py-3">
                    <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="font-medium">代码</span>
                      <span className="num">{h.code.length} 字符</span>
                    </div>
                    <pre className="max-h-64 overflow-auto rounded bg-card/80 px-2.5 py-2 font-mono text-[11px] text-foreground">
                      {h.code}
                    </pre>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
