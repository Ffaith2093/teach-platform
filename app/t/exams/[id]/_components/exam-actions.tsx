"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, Send, Loader2, Trash2, Archive, Activity } from "lucide-react";
import {
  publishExamAction,
  unpublishExamAction,
  closeExamAction,
  deleteExamAction,
} from "@/app/t/exams/actions";

export function ExamActions({
  examId,
  status,
  isOwner,
  hasAttempts,
  questionCount,
  pendingGradeCount,
}: {
  examId: string;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  isOwner: boolean;
  hasAttempts: boolean;
  questionCount: number;
  pendingGradeCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function withConfirm(msg: string, fn: () => void) {
    if (!confirm(msg)) return;
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        if ((e as Error).message === "NEXT_REDIRECT") return;
        alert((e as Error).message);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      {status !== "DRAFT" && (
        <Button asChild variant="outline" size="sm">
          <Link href={`/t/exams/${examId}/monitor`}>
            <Activity className="h-3.5 w-3.5" />
            监考
          </Link>
        </Button>
      )}
      {hasAttempts && status !== "DRAFT" && (
        <Button asChild variant="outline" size="sm">
          <Link href={`/t/exams/${examId}/grade`}>
            <ClipboardCheck className="h-3.5 w-3.5" />
            批改
            {pendingGradeCount > 0 && (
              <span className="num ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-warning px-1.5 text-[10px] font-medium text-warning-foreground">
                {pendingGradeCount}
              </span>
            )}
          </Link>
        </Button>
      )}
      {status === "DRAFT" && (
        <Button
          size="sm"
          disabled={pending || questionCount === 0}
          onClick={() =>
            withConfirm("确定发布试卷吗？发布后学生可在开考时间参与。", async () => {
              await publishExamAction(examId);
              router.refresh();
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <Send />}
          发布
        </Button>
      )}
      {status === "PUBLISHED" && isOwner && !hasAttempts && (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            withConfirm("撤回后试卷将变回草稿态，确认吗？", async () => {
              await unpublishExamAction(examId);
              router.refresh();
            })
          }
        >
          <Archive />
          撤回
        </Button>
      )}
      {status === "PUBLISHED" && (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            withConfirm("确定手动结束这场考试吗？结束后学生不能再作答。", async () => {
              await closeExamAction(examId);
              router.refresh();
            })
          }
        >
          <Archive />
          结束考试
        </Button>
      )}
      {isOwner && (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            withConfirm(
              hasAttempts
                ? "已有学生参加，无法删除（请改用撤回/结束）"
                : "确定删除这份试卷吗？此操作不可恢复。",
              async () => {
                await deleteExamAction(examId);
                // redirect handled in action
              },
            )
          }
          className={
            hasAttempts
              ? "text-subtle-foreground"
              : "text-danger hover:bg-danger-subtle hover:text-danger"
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
          删除
        </Button>
      )}
    </div>
  );
}
