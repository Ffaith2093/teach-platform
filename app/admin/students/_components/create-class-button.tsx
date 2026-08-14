"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { createClassAction, type ActionState } from "@/app/admin/students/actions";

const initial: ActionState = {};

export function CreateClassButton({ gradeId, disabled }: { gradeId: string; disabled?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [state, formAction, pending] = React.useActionState(createClassAction, initial);
  const currentYear = new Date().getFullYear();

  React.useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>
          <Plus />
          新建班级
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建班级</DialogTitle>
          <DialogDescription>
            班级名在同一年级内不可重复；班级一旦有学生后不可直接删除，需先转出学生。
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="gradeId" value={gradeId} />
          <div className="space-y-1.5">
            <Label htmlFor="class-name">班级名称</Label>
            <Input id="class-name" name="name" placeholder="高一(1)班" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="class-year">入学年份</Label>
            <Input
              id="class-year"
              name="joinYear"
              type="number"
              min={2000}
              max={2100}
              defaultValue={currentYear}
              required
            />
          </div>
          {state.error && (
            <div className="rounded-lg border border-danger/30 bg-danger-subtle/40 px-3 py-2 text-xs text-danger">
              {state.error}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "创建中…" : "创建"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}