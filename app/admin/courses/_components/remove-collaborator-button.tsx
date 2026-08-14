"use client";

import * as React from "react";
import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { removeCourseCollaboratorAction } from "@/app/admin/courses/actions";

interface Props {
  courseId: string;
  teacherId: string;
  teacherName: string;
}

export function RemoveCollaboratorButton({ courseId, teacherId, teacherName }: Props) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function handle() {
    setError(null);
    startTransition(async () => {
      try {
        await removeCourseCollaboratorAction(courseId, teacherId);
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
          aria-label="移除协作者"
          className="rounded-md p-1 text-subtle-foreground transition-colors hover:bg-danger-subtle hover:text-danger"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>移除协作者「{teacherName}」？</DialogTitle>
          <DialogDescription>
            移除后该教师将失去本课程的访问权限，已发布的作业/试卷仍可在历史记录中看到。
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
          <Button type="button" variant="danger" disabled={pending} onClick={handle}>
            {pending ? "移除中…" : "确认移除"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}