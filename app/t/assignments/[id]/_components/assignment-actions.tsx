"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Send,
  Undo2,
  Trash2,
  Loader2,
} from "lucide-react";
import {
  publishAssignmentAction,
  unpublishAssignmentAction,
  deleteAssignmentAction,
} from "@/app/t/assignments/actions";

export function AssignmentActions({
  assignmentId,
  isDraft,
  isOwner,
  hasSubmissions,
}: {
  assignmentId: string;
  courseId: string;
  isDraft: boolean;
  isOwner: boolean;
  hasSubmissions: boolean;
  canAddProblem?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function handlePublish() {
    setError(null);
    startTransition(async () => {
      try {
        await publishAssignmentAction(assignmentId);
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  function handleUnpublish() {
    setError(null);
    if (!confirm("撤回后作业将变为草稿。确定要撤回吗？")) return;
    startTransition(async () => {
      try {
        await unpublishAssignmentAction(assignmentId);
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  function handleDelete() {
    setError(null);
    if (!confirm("删除后无法恢复，确定要删除这份作业吗？")) return;
    startTransition(async () => {
      try {
        await deleteAssignmentAction(assignmentId);
      } catch (e) {
        if ((e as Error).message === "NEXT_REDIRECT") return;
        setError((e as Error).message);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {isDraft && (
          <Button onClick={handlePublish} disabled={pending}>
            {pending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Send />
            )}
            发布作业
          </Button>
        )}
        {!isDraft && hasSubmissions && (
          <Button variant="outline" onClick={handleUnpublish} disabled={pending}>
            <Undo2 />
            撤回发布
          </Button>
        )}
        {isOwner && (
          <Button
            variant="outline"
            onClick={handleDelete}
            disabled={pending}
            className="text-danger hover:bg-danger-subtle hover:text-danger"
          >
            <Trash2 />
            删除
          </Button>
        )}
      </div>
      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger-subtle/40 px-3 py-1.5 text-xs text-danger">
          {error}
        </div>
      )}
    </div>
  );
}