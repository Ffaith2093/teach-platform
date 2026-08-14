"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Send, Loader2, RotateCcw } from "lucide-react";
import {
  publishAttemptAction,
  reopenAttemptAction,
} from "@/app/t/exams/[id]/grade/actions";
import type { AttemptStatus } from "@prisma/client";

export function GradeHeaderActions({
  examId,
  attemptId,
  status,
  isOwner,
}: {
  examId: string;
  attemptId: string;
  status: AttemptStatus;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [message, setMessage] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function withConfirm(msg: string, fn: () => Promise<{ ok?: boolean; error?: string } | undefined>) {
    if (!confirm(msg)) return;
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await fn();
        if (res && res.ok) {
          setMessage({ kind: "ok", text: "已更新" });
          router.refresh();
        } else if (res?.error) {
          setMessage({ kind: "err", text: res.error });
        }
      } catch (e) {
        setMessage({ kind: "err", text: (e as Error).message });
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      {message && (
        <span
          className={`text-xs ${message.kind === "ok" ? "text-success" : "text-danger"}`}
        >
          {message.text}
        </span>
      )}
      {status === "GRADING" && isOwner && (
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            withConfirm("发布后学生将看到最终成绩，确认？", () =>
              publishAttemptAction(attemptId),
            )
          }
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          发布成绩
        </Button>
      )}
      {status === "GRADED" && isOwner && (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            withConfirm("重新打开后学生将暂时看不到成绩，确认？", () =>
              reopenAttemptAction(attemptId),
            )
          }
        >
          <RotateCcw className="h-3.5 w-3.5" />
          重新打开
        </Button>
      )}
    </div>
  );
}