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
import { setGradeActiveAction } from "@/app/admin/students/actions";

interface Props {
  gradeId: string;
  isActive: boolean;
  gradeName: string;
}

export function ToggleGradeActiveButton({ gradeId, isActive, gradeName }: Props) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function handleToggle() {
    startTransition(async () => {
      await setGradeActiveAction(gradeId, !isActive);
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
            {isActive ? `停用「${gradeName}」？` : `启用「${gradeName}」？`}
          </DialogTitle>
          <DialogDescription>
            {isActive
              ? "停用后，该年级及其下所有班级将不再出现在教师/学生可选列表中，但已产生的历史数据（作业、考试、成绩）不会被删除。"
              : "启用后，该年级及其下所有班级将重新出现在教师/学生可选列表中。"}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button type="button" variant={isActive ? "danger" : "default"} disabled={pending} onClick={handleToggle}>
            {pending ? "处理中…" : isActive ? "确认停用" : "确认启用"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}