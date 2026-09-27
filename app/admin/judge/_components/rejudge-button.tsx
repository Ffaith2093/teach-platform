"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RotateCcw, Loader2 } from "lucide-react";
import { rejudgeSubmissionAction } from "../actions";

export function RejudgeButton({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function handleClick() {
    if (!confirm("确认重跑这个提交？将立即重新入队，Submission 状态会先重置为 PENDING。"))
      return;
    startTransition(async () => {
      try {
        const res = await rejudgeSubmissionAction(submissionId);
        if (res.error) {
          alert(res.error);
          return;
        }
        router.refresh();
      } catch (e) {
        alert((e as Error).message);
      }
    });
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={handleClick}
      disabled={pending}
      className="h-7 gap-1.5 text-xs"
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <RotateCcw className="h-3.5 w-3.5" />
      )}
      重跑
    </Button>
  );
}