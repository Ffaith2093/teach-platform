"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Send, CheckCircle2, Loader2, Trash2, Archive } from "lucide-react";
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
}: {
  examId: string;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  isOwner: boolean;
  hasAttempts: boolean;
  questionCount: number;
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
