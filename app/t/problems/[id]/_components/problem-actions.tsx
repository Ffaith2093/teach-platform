"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PlayCircle, Trash2, Loader2 } from "lucide-react";
import { deleteProblemAction } from "@/app/t/problems/actions";

export function ProblemActions({
  problemId,
  hasRefs,
}: {
  problemId: string;
  hasRefs: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function handleDelete() {
    setError(null);
    if (!confirm("确定删除这个题目吗？")) return;
    startTransition(async () => {
      try {
        await deleteProblemAction(problemId);
      } catch (e) {
        if ((e as Error).message === "NEXT_REDIRECT") return;
        setError((e as Error).message);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <Link
          href={`/t/problems/${problemId}/test`}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-primary bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
        >
          <PlayCircle />
          验证用例
        </Link>
        <Button
          variant="outline"
          onClick={handleDelete}
          disabled={pending || hasRefs}
          className="text-danger hover:bg-danger-subtle hover:text-danger disabled:opacity-50"
          title={hasRefs ? "已被引用，无法删除" : "删除"}
        >
          {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
          删除
        </Button>
      </div>
      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger-subtle/40 px-3 py-1.5 text-xs text-danger">
          {error}
        </div>
      )}
    </div>
  );
}