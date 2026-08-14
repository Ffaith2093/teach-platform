"use client";

import * as React from "react";
import { Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { setTeacherActiveAction } from "@/app/admin/teachers/actions";

interface Props {
  teacherId: string;
  isActive: boolean;
  teacherName: string;
}

export function ToggleTeacherActiveButton({ teacherId, isActive, teacherName }: Props) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function handleToggle() {
    startTransition(async () => {
      await setTeacherActiveAction(teacherId, !isActive);
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {isActive ? "停用" : "启用"}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isActive ? `停用教师「${teacherName}」？` : `启用教师「${teacherName}」？`}
          </DialogTitle>
          <DialogDescription>
            {isActive
              ? "停用后该教师无法登录，但其历史数据（作业、试卷、成绩）保留，关联班级将进入「未分配」状态。"
              : "启用后该教师可正常登录，分配给其的班级仍归其所有。"}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button
            type="button"
            variant={isActive ? "danger" : "default"}
            disabled={pending}
            onClick={handleToggle}
          >
            {pending ? "处理中…" : isActive ? "确认停用" : "确认启用"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}