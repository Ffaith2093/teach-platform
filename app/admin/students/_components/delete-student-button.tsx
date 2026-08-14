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
import { deleteStudentAction } from "@/app/admin/students/actions";

interface Props {
  gradeId: string;
  classId: string;
  studentId: string;
  studentName: string;
  studentNo: string;
}

export function DeleteStudentButton({ gradeId, classId, studentId, studentName, studentNo }: Props) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteStudentAction(gradeId, classId, studentId);
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
          aria-label="删除学生"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            删除学生「{studentName}」（{studentNo}）？
          </DialogTitle>
          <DialogDescription>
            将从班级移除该学生账号，相关历史作业与成绩将被一并清理，操作不可撤销。
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
          <Button type="button" variant="danger" disabled={pending} onClick={handleDelete}>
            {pending ? "删除中…" : "确认删除"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}