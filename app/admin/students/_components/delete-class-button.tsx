"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { deleteClassAction } from "@/app/admin/students/actions";

interface Props {
  gradeId: string;
  classId: string;
  className: string;
  studentCount: number;
}

export function DeleteClassButton({ gradeId, classId, className, studentCount }: Props) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const hasStudents = studentCount > 0;

  function handleDelete() {
    if (hasStudents) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteClassAction(gradeId, classId);
        setOpen(false);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="rounded-md p-1.5 text-subtle-foreground transition-colors hover:bg-danger-subtle hover:text-danger"
          aria-label="删除班级"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>删除班级「{className}」？</DialogTitle>
          <DialogDescription>
            {hasStudents
              ? `该班级内仍有 ${studentCount} 名学生，请先通过「转班」批量转出学生后再删除。`
              : "删除后将释放该班级占用的任课教师绑定，操作不可撤销。"}
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
            disabled={pending || hasStudents}
            onClick={handleDelete}
          >
            {pending ? "删除中…" : hasStudents ? "班级内有学生" : "确认删除"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}