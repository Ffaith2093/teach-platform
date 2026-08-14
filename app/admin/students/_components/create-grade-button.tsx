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
import { createGradeAction, type ActionState } from "@/app/admin/students/actions";

const initial: ActionState = {};

export function CreateGradeButton() {
  const [open, setOpen] = React.useState(false);
  const [state, formAction, pending] = React.useActionState(createGradeAction, initial);

  React.useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  const currentYear = new Date().getFullYear();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          新建年级
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建年级</DialogTitle>
          <DialogDescription>
            年级一旦创建，名称不可修改；停用年级会级联停用其下所有班级。
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="grade-name">年级名称</Label>
            <Input
              id="grade-name"
              name="name"
              placeholder={`${currentYear} 级 高一年级`}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="grade-year">入学年份</Label>
            <Input
              id="grade-year"
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