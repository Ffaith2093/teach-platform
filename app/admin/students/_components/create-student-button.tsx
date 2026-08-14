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
import { createStudentAction, type ActionState } from "@/app/admin/students/actions";

const initial: ActionState = {};

export function CreateStudentButton({
  classId,
  className,
}: {
  classId: string;
  className: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [state, formAction, pending] = React.useActionState(createStudentAction, initial);

  React.useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          添加学生
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>向「{className}」添加学生</DialogTitle>
          <DialogDescription>
            初始密码 = 学号后 6 位，学生首次登录将被强制跳转修改密码页。
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="classId" value={classId} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="s-name">姓名</Label>
              <Input id="s-name" name="name" placeholder="张三" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-no">学号</Label>
              <Input
                id="s-no"
                name="studentNo"
                placeholder="20240101"
                pattern="\d{8}"
                maxLength={8}
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-email">邮箱（可选）</Label>
            <Input
              id="s-email"
              name="email"
              type="email"
              placeholder="zhangsan@school.edu"
            />
            <p className="text-[11px] text-subtle-foreground">
              留空将自动生成 <span className="num">学号@school.edu</span>
            </p>
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
              {pending ? "添加中…" : "添加"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}