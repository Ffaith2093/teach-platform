"use client";

import * as React from "react";
import Link from "next/link";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { FileText, ArrowRight, AlertTriangle } from "lucide-react";
import { relativeTime, formatDate } from "@/lib/utils";

export type MissingItem = {
  id: string;
  title: string;
  dueAt: string;
  courseId: string;
  courseTitle: string;
  totalScore: number;
};

export function MissingDetailDialog({
  studentName,
  studentNo,
  items,
}: {
  studentName: string;
  studentNo: string | null;
  items: MissingItem[];
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex cursor-pointer items-center"
      >
        <Badge variant="danger">
          <span className="num">{items.length}</span>
          <span className="ml-1">项</span>
        </Badge>
      </button>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-danger" />
            欠交作业明细
          </DialogTitle>
          <DialogDescription>
            <span className="font-mono text-xs num text-muted-foreground">{studentNo ?? "—"}</span>{" "}
            <span className="font-medium text-foreground">{studentName}</span>
            <span className="mx-1">·</span>
            共 <span className="num font-medium text-foreground">{items.length}</span> 项未交
          </DialogDescription>
        </DialogHeader>

        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/40 px-6 py-10 text-center text-sm text-muted-foreground">
            已交齐 ✨
          </div>
        ) : (
          <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {items.map((it) => {
              const due = new Date(it.dueAt);
              const overdue = due.getTime() < Date.now();
              return (
                <li key={it.id}>
                  <Link
                    href={`/t/assignments/${it.id}/grade`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                  >
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        overdue ? "bg-danger-subtle text-danger" : "bg-warning-subtle text-warning"
                      }`}
                    >
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{it.title}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span className="text-primary-subtle">{it.courseTitle}</span>
                        <span className="text-subtle-foreground">·</span>
                        <span className="num">
                          {overdue ? (
                            <span className="font-medium text-danger">
                              已逾期 {relativeTime(due)}
                            </span>
                          ) : (
                            `${relativeTime(due)}截止`
                          )}
                        </span>
                        <span className="text-subtle-foreground">·</span>
                        <span className="num text-subtle-foreground">{formatDate(due)}</span>
                        <span className="text-subtle-foreground">·</span>
                        <span className="num">总分 {it.totalScore}</span>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-subtle-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}