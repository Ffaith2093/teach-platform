"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Activity, Clock, MapPin, Globe } from "lucide-react";
import { formatDate } from "@/lib/utils";

export type AccessEntry = {
  createdAt: string;
  ip: string | null;
  userAgent: string | null;
};

export function AccessDetailDialog({
  studentName,
  studentNo,
  entries,
}: {
  studentName: string;
  studentNo: string | null;
  entries: AccessEntry[];
}) {
  const [open, setOpen] = React.useState(false);

  const summary = React.useMemo(() => {
    if (entries.length === 0) {
      return { total: 0, first: null, last: null };
    }
    const sorted = [...entries].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return {
      total: entries.length,
      first: sorted[sorted.length - 1].createdAt,
      last: sorted[0].createdAt,
    };
  }, [entries]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="-mx-1 inline-flex cursor-pointer items-center gap-1.5 rounded px-1 text-left transition-colors hover:text-primary"
      >
        <span className="font-mono text-[11px] text-muted-foreground num">
          {studentNo ?? "—"}
        </span>
        <span className="font-medium text-foreground">{studentName}</span>
      </button>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            访问明细
          </DialogTitle>
          <DialogDescription>
            <span className="font-mono text-xs num text-muted-foreground">{studentNo ?? "—"}</span>{" "}
            <span className="font-medium text-foreground">{studentName}</span>
            <span className="mx-1">·</span>
            过去 30 天 <span className="num font-medium text-foreground">{summary.total}</span> 次访问
          </DialogDescription>
        </DialogHeader>

        {summary.total > 0 && (
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/30 p-3 text-xs">
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">最近访问</span>
              <span className="num font-medium text-foreground">
                {formatDate(new Date(summary.last!))}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">最早访问</span>
              <span className="num font-medium text-foreground">
                {formatDate(new Date(summary.first!))}
              </span>
            </div>
          </div>
        )}

        {entries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/40 px-6 py-10 text-center text-sm text-muted-foreground">
            过去 30 天该生未访问过本课程页
          </div>
        ) : (
          <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {entries.map((e, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                  <Activity className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="num text-sm font-medium text-foreground">
                      {formatDate(new Date(e.createdAt))}
                    </span>
                    <span className="num text-xs text-subtle-foreground">
                      {new Date(e.createdAt).toLocaleTimeString("zh-CN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {e.ip ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        <span className="font-mono num">{e.ip}</span>
                      </span>
                    ) : (
                      <span className="text-subtle-foreground">无 IP</span>
                    )}
                    {e.userAgent && (
                      <span
                        className="inline-flex max-w-[280px] items-center gap-1 truncate"
                        title={e.userAgent}
                      >
                        <Globe className="h-3 w-3" />
                        <span className="truncate">{e.userAgent}</span>
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}