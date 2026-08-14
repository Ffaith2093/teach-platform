"use client";

import * as React from "react";
import { Archive, ArchiveRestore } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { archiveCourseAction, unarchiveCourseAction } from "@/app/admin/courses/actions";

interface Props {
  courseId: string;
  courseTitle: string;
  isArchived: boolean;
}

export function ArchiveCourseButton({ courseId, courseTitle, isArchived }: Props) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function handle() {
    startTransition(async () => {
      if (isArchived) await unarchiveCourseAction(courseId);
      else await archiveCourseAction(courseId);
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={isArchived ? "outline" : "soft"}>
          {isArchived ? <ArchiveRestore /> : <Archive />}
          {isArchived ? "恢复" : "归档"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isArchived ? `恢复课程「${courseTitle}」？` : `归档课程「${courseTitle}」？`}
          </DialogTitle>
          <DialogDescription>
            {isArchived
              ? "恢复后课程重新出现在教师与学生的可选列表中。"
              : "归档后课程对教师与学生隐藏，但历史作业与成绩保留。需要时可随时恢复。"}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button type="button" disabled={pending} onClick={handle}>
            {pending ? "处理中…" : isArchived ? "确认恢复" : "确认归档"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}