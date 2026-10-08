"use client";

import * as React from "react";
import { KeyRound, Copy, Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { copyText } from "@/lib/client/copy-text";

interface Props {
  teacherId: string;
  teacherName: string;
  teacherNo: string;
}

/**
 * 教师重置密码：通过调用内部 API（管理员专属）生成新密码
 * 简化方案：调用一个一次性的 server action，重置密码 = teacherNo 后 6 位（与学生一致策略）
 *   实际生产可改为 generateInitialPassword() 生成随机密码
 */
function deriveResetPassword(teacherNo: string): string {
  // 教师工号格式 4-12 位数字 → 取后 6 位作为重置密码
  return teacherNo.slice(-6).padStart(6, "0");
}

export function ResetTeacherPasswordButton({ teacherId, teacherName, teacherNo }: Props) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [password, setPassword] = React.useState(deriveResetPassword(teacherNo));
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function applyReset() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/teachers/${teacherId}/reset-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newPassword: password }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.message ?? `HTTP ${res.status}`);
        }
      } catch (e) {
        setError((e as Error).message);
      }
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
        <Button variant="outline">
          <KeyRound />
          重置密码
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>重置「{teacherName}」的密码</DialogTitle>
          <DialogDescription>
            默认采用<b>工号后 6 位</b>作为初始密码（不足 6 位前补 0），教师下次登录将被强制修改。
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

        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger-subtle/40 px-3 py-2 text-xs text-danger">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            关闭
          </Button>
          <Button type="button" disabled={pending} onClick={applyReset}>
            {pending ? "重置中…" : "确认重置"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
