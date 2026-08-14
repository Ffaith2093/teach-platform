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
import { transferCourseOwnershipAction } from "@/app/admin/courses/actions";

interface Props {
  courseId: string;
  currentOwnerName: string;
  collaborators: { id: string; name: string }[];
}

export function TransferOwnershipButton({ courseId, currentOwnerName, collaborators }: Props) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [targetId, setTargetId] = React.useState<string>(collaborators[0]?.id ?? "");
  const [error, setError] = React.useState<string | null>(null);

  function handle() {
    setError(null);
    startTransition(async () => {
      try {
        await transferCourseOwnershipAction(courseId, targetId);
        setOpen(false);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[11px] text-primary transition-colors hover:underline"
        >
          <ArrowRightLeft className="h-3 w-3" />
          转让所有权
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>转让课程所有权</DialogTitle>
          <DialogDescription>
            当前 OWNER「{currentOwnerName}」将降级为助教，新任 OWNER 获得删除/转让/移除协作者权限。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="new-owner">新主讲教师</Label>
          <select
            id="new-owner"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="flex h-9 w-full rounded-lg border border-border bg-muted px-3 text-sm focus-visible:border-primary focus-visible:bg-card focus-visible:outline-none"
            required
          >
            {collaborators.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
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
          <Button type="button" disabled={pending || !targetId} onClick={handle}>
            {pending ? "转让中…" : "确认转让"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}