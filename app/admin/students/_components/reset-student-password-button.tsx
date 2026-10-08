"use client";

import * as React from "react";
import { KeyRound, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { resetStudentPasswordAction } from "@/app/admin/students/actions";
import { copyText } from "@/lib/client/copy-text";

interface Props {
  gradeId: string;
  classId: string;
  studentId: string;
  studentName: string;
  newPassword: string; // 初始值（学号后 6 位），可能与已重置过的不同
}

export function ResetStudentPasswordButton({
  gradeId,
  classId,
  studentId,
  studentName,
  newPassword,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [password, setPassword] = React.useState(newPassword);
  const [copied, setCopied] = React.useState(false);

  function handleReset() {
    startTransition(async () => {
      const pwd = await resetStudentPasswordAction(gradeId, classId, studentId);
      setPassword(pwd);
      setCopied(false);
    });
  }

  async function copy() {
    try {
      if (!(await copyText(password))) throw new Error("复制失败");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="rounded-md p-1.5 text-subtle-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="重置密码"
          title="重置密码"
        >
          <KeyRound className="h-3.5 w-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>重置「{studentName}」的密码</DialogTitle>
          <DialogDescription>
            重置后初始密码 = 学号后 6 位，学生再次登录将被强制修改。
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-muted p-4">
          <div className="text-xs text-muted-foreground">新初始密码</div>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="flex-1 select-all rounded-md bg-background px-3 py-2 font-mono text-lg font-semibold tracking-wider num">
              {password}
            </code>
            <Button type="button" variant="outline" size="sm" onClick={copy}>
              {copied ? <Check /> : <Copy />}
              {copied ? "已复制" : "复制"}
            </Button>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            关闭
          </Button>
          <Button type="button" disabled={pending} onClick={handleReset}>
            {pending ? "重置中…" : "重新生成"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
