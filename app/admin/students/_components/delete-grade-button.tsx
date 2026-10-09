"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { deleteGradeAction } from "@/app/admin/students/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function DeleteGradeButton({
  gradeId,
  gradeName,
  classCount,
}: {
  gradeId: string;
  gradeName: string;
  classCount: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const hasClasses = classCount > 0;

  function handleDelete() {
    if (hasClasses) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteGradeAction(gradeId);
        setOpen(false);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "删除失败");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="rounded-md p-1.5 text-subtle-foreground transition-colors hover:bg-danger-subtle hover:text-danger"
          aria-label={`删除年级 ${gradeName}`}
          title="删除年级"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>删除年级「{gradeName}」？</DialogTitle>
          <DialogDescription>
            {hasClasses
              ? `该年级下仍有 ${classCount} 个班级，请先清空并删除这些班级。`
              : "删除年级后无法恢复，请确认该年级已不再使用。"}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger-subtle/40 px-3 py-2 text-xs text-danger">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={pending || hasClasses}
            onClick={handleDelete}
          >
            {pending ? "删除中…" : hasClasses ? "年级内有班级" : "确认删除"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
