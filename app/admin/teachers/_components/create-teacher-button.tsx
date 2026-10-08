"use client";

import * as React from "react";
import { Plus, Copy, Check } from "lucide-react";
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
import { createTeacherAction, type CreateTeacherState } from "@/app/admin/teachers/actions";
import { copyText } from "@/lib/client/copy-text";

const initial: CreateTeacherState = {};

interface ClassOption {
  id: string;
  name: string;
  gradeName: string;
  teacherName?: string | null;
}

export function CreateTeacherButton({ classes }: { classes?: ClassOption[] }) {
  const [open, setOpen] = React.useState(false);
  const [state, formAction, pending] = React.useActionState(createTeacherAction, initial);
  const [passwordToShow, setPasswordToShow] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (state.ok && state.initialPassword) {
      setPasswordToShow(state.initialPassword);
    }
  }, [state]);

  function handleClose() {
    setOpen(false);
    setPasswordToShow(null);
    setCopied(false);
  }

  async function copy() {
    if (!passwordToShow) return;
    try {
      if (!(await copyText(passwordToShow))) throw new Error("复制失败");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  const fieldErrors = state.fieldErrors;
  const generalError = state.error;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose();
        else setOpen(true);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus />
          新建教师
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{passwordToShow ? "教师创建成功" : "新建教师"}</DialogTitle>
          <DialogDescription>
            {passwordToShow
              ? "请将初始密码安全传达给教师本人，关闭弹窗后密码将不再可见。"
              : "初始密码由系统生成（8 位字母+数字），教师首次登录强制修改。"}
          </DialogDescription>
        </DialogHeader>

        {passwordToShow ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-success/30 bg-success-subtle/30 p-4">
              <div className="text-xs text-success">教师初始密码</div>
              <div className="mt-1.5 flex items-center gap-2">
                <code className="flex-1 select-all rounded-md bg-background px-3 py-2 font-mono text-lg font-semibold tracking-wider num">
                  {passwordToShow}
                </code>
                <Button type="button" variant="outline" size="sm" onClick={copy}>
                  {copied ? <Check /> : <Copy />}
                  {copied ? "已复制" : "复制"}
                </Button>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" onClick={handleClose}>
                完成
              </Button>
            </div>
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="t-name">姓名</Label>
                <Input id="t-name" name="name" placeholder="王建国" required />
                {fieldErrors?.name && (
                  <p className="text-xs text-danger">{fieldErrors.name}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-no">工号</Label>
                <Input
                  id="t-no"
                  name="teacherNo"
                  placeholder="T0001"
                  pattern="\d{4,12}"
                  maxLength={12}
                  required
                />
                {fieldErrors?.teacherNo && (
                  <p className="text-xs text-danger">{fieldErrors.teacherNo}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="t-email">邮箱</Label>
                <Input
                  id="t-email"
                  name="email"
                  type="email"
                  placeholder="wang.jianguo@school.edu"
                  required
                />
                {fieldErrors?.email && (
                  <p className="text-xs text-danger">{fieldErrors.email}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-phone">手机号（可选）</Label>
                <Input id="t-phone" name="phone" placeholder="13800138000" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="t-subjects">教学科目</Label>
              <Input
                id="t-subjects"
                name="subjects"
                placeholder="信息技术, 通用技术（用逗号分隔）"
              />
              <p className="text-[11px] text-subtle-foreground">
                多个科目用「,」「，」「、」分隔，例如：信息技术, 通用技术
              </p>
            </div>

            {classes && classes.length > 0 && (
              <div className="space-y-2">
                <Label>初始分配班级（可选）</Label>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-muted/40 p-2 space-y-1">
                  {classes.map((c) => (
                    <label
                      key={c.id}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        name="initialClassIds"
                        value={c.id}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                      />
                      <span className="font-medium text-foreground">{c.name}</span>
                      <span className="text-xs text-muted-foreground">· {c.gradeName}</span>
                      {c.teacherName && (
                        <span className="ml-auto text-[11px] text-warning">
                          当前：{c.teacherName}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-subtle-foreground">
                  勾选后该班级将<b>直接转交</b>给新教师，已存在的任课教师会被顶替。
                </p>
              </div>
            )}

            {generalError && (
              <div className="rounded-lg border border-danger/30 bg-danger-subtle/40 px-3 py-2 text-xs text-danger">
                {generalError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={handleClose}>
                取消
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "创建中…" : "创建"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
