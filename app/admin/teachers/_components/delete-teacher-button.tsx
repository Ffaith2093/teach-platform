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
import { deleteTeacherAction } from "@/app/admin/teachers/actions";

interface Props {
  teacherId: string;
  teacherName: string;
  hasAssignments: boolean;
  hasCourses: boolean;
}

export function DeleteTeacherButton({ teacherId, teacherName, hasAssignments, hasCourses }: Props) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const blocked = hasAssignments || hasCourses;

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteTeacherAction(teacherId);
        setOpen(false);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Trash2 />
          删除教师
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>删除教师「{teacherName}」？</DialogTitle>
          <DialogDescription>
            {blocked
              ? "该教师仍有关联的课程或作业，无法删除。请先转让课程所有权或归档其作业。"
              : "删除后将释放该教师任教的班级占用，操作不可撤销。"}
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
            disabled={pending || blocked}
            onClick={handleDelete}
          >
            {pending ? "删除中…" : blocked ? "存在关联数据" : "确认删除"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}