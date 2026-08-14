"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Trash2, Loader2 } from "lucide-react";
import { deleteBankAction } from "@/app/t/banks/actions";

export function BankActions({
  bankId,
  questionCount,
}: {
  bankId: string;
  questionCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function handleDelete() {
    setError(null);
    if (questionCount > 0) {
      const ok = confirm(
        `题库内还有 ${questionCount} 题。删除题库会同时移除所有收录记录（不会删除题目本体）。确定吗？`,
      );
      if (!ok) return;
    } else {
      if (!confirm("确定删除这个空题库吗？")) return;
    }
    startTransition(async () => {
      try {
        await deleteBankAction(bankId);
      } catch (e) {
        if ((e as Error).message === "NEXT_REDIRECT") return;
        setError((e as Error).message);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        variant="outline"
        onClick={handleDelete}
        disabled={pending}
        className="text-danger hover:bg-danger-subtle hover:text-danger"
      >
        {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
        删除题库
      </Button>
      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger-subtle/40 px-3 py-1.5 text-xs text-danger">
          {error}
        </div>
      )}
    </div>
  );
}