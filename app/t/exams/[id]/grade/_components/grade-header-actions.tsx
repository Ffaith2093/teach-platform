"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Send, Loader2 } from "lucide-react";
import { publishAllGradedAction } from "@/app/t/exams/[id]/grade/actions";

export function GradeHeaderActions({
  examId,
  isOwner,
  todoCount,
}: {
  examId: string;
  isOwner: boolean;
  todoCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [message, setMessage] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function onPublishAll() {
    if (!isOwner) return;
    if (!confirm("将所有「批改中」的试卷标记为「已发布」并写入最终成绩，确认？")) return;
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await publishAllGradedAction(examId);
        if (res.ok) {
          setMessage({
            kind: "ok",
            text: res.count && res.count > 0 ? `已发布 ${res.count} 份` : "暂无可发布的试卷",
          });
          router.refresh();
        } else {
          setMessage({ kind: "err", text: res.error ?? "发布失败" });
        }
      } catch (e) {
        setMessage({ kind: "err", text: (e as Error).message });
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      {message && (
        <span
          className={`text-xs ${message.kind === "ok" ? "text-success" : "text-danger"}`}
        >
          {message.text}
        </span>
      )}
      {isOwner && todoCount > 0 && (
        <Button
          size="sm"
          onClick={onPublishAll}
          disabled={pending}
          title="将状态为「批改中」的试卷一次性发布为「已发布」"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          批量发布
        </Button>
      )}
    </div>
  );
}