/**
 * 评测结果轮询 hook（SPEC §3.1）
 *
 * 每 intervalMs（默认 1000）打一次 /api/submissions/[id]，最多 maxAttempts 次。
 * 终态（PENDING / JUDGING 之外）停轮询并返回结果。
 */
"use client";

import * as React from "react";

export type PolledCase = {
  testCaseId: string;
  order: number;
  isSample: boolean;
  status: string;
  timeMs: number;
  actualOutput?: string;
  errorMsg?: string;
};

export type PolledSubmission = {
  id: string;
  status: string;
  score: number;
  passedCount: number;
  totalCount: number;
  errorMsg?: string | null;
  maxTimeMs?: number | null;
  cases: PolledCase[];
};

export type PollState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "polling"; attempt: number }
  | { kind: "done"; submission: PolledSubmission }
  | { kind: "timeout"; attempts: number }
  | { kind: "error"; message: string };

const TERMINAL_STATUSES = new Set([
  "ACCEPTED",
  "WRONG_ANSWER",
  "TLE",
  "MLE",
  "RUNTIME_ERROR",
  "COMPILE_ERROR",
  "SYSTEM_ERROR",
]);

export function usePollSubmission(
  submissionId: string | null,
  opts?: { intervalMs?: number; maxAttempts?: number },
) {
  const intervalMs = opts?.intervalMs ?? 1000;
  const maxAttempts = opts?.maxAttempts ?? 60;
  const [state, setState] = React.useState<PollState>({ kind: "idle" });

  React.useEffect(() => {
    if (!submissionId) {
      setState({ kind: "idle" });
      return;
    }
    let cancelled = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      attempt += 1;
      setState({ kind: "polling", attempt });
      try {
        const res = await fetch(`/api/submissions/${submissionId}`, {
          cache: "no-store",
        });
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: "error", message: `HTTP ${res.status}` });
          return;
        }
        const data = (await res.json()) as PolledSubmission;
        if (TERMINAL_STATUSES.has(data.status)) {
          setState({ kind: "done", submission: data });
          return;
        }
        if (attempt >= maxAttempts) {
          setState({ kind: "timeout", attempts: attempt });
          return;
        }
        timer = setTimeout(tick, intervalMs);
      } catch (e) {
        if (cancelled) return;
        setState({ kind: "error", message: (e as Error).message });
      }
    };

    setState({ kind: "loading" });
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [submissionId, intervalMs, maxAttempts]);

  return state;
}
