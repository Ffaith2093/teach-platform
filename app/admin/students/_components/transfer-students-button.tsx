"use client";

import * as React from "react";
import { ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { transferStudentsAction } from "@/app/admin/students/actions";

interface ClassOption {
  id: string;
  name: string;
  grade: { name: string };
}

interface Props {
  fromClassId: string;
  classes: ClassOption[];
}

export function TransferStudentsButton({ fromClassId, classes }: Props) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [toClassId, setToClassId] = React.useState<string>(classes[0]?.id ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [transferred, setTransferred] = React.useState<number | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setTransferred(null);
    startTransition(async () => {
      try {
        const count = await transferStudentsAction({
          fromClassId,
          toClassId,
        });
        setTransferred(count);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setError(null);
          setTransferred(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <ArrowRightLeft />
          转出全班
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>批量转班</DialogTitle>
          <DialogDescription>
            将本班全部学生转出到目标班级。转班后学生自动同步到目标班级的所有课程，历史作业与成绩不被删除。
          </DialogDescription>
        </DialogHeader>

        {transferred === null ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input type="hidden" name="fromClassId" value={fromClassId} />
            <div className="space-y-1.5">
              <Label htmlFor="to-class">目标班级</Label>
              <select
                id="to-class"
                value={toClassId}
                onChange={(e) => setToClassId(e.target.value)}
                className="flex h-9 w-full rounded-lg border border-border bg-muted px-3 text-sm shadow-sm focus-visible:border-primary focus-visible:bg-card focus-visible:outline-none"
                required
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.grade.name} · {c.name}
                  </option>
                ))}
              </select>
              {classes.length === 0 && (
                <p className="text-[11px] text-warning">系统中没有其他可用的班级</p>
              )}
            </div>
            {error && (
              <div className="rounded-lg border border-danger/30 bg-danger-subtle/40 px-3 py-2 text-xs text-danger">
                {error}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={pending || classes.length === 0}>
                {pending ? "转出中…" : "确认转出"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-success/30 bg-success-subtle/40 p-4 text-sm text-success">
              已成功转出 <b>{transferred}</b> 名学生。
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" onClick={() => setOpen(false)}>
                完成
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}