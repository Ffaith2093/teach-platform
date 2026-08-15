"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Megaphone, Loader2, CheckCircle2 } from "lucide-react";
import { announceCourseAction } from "@/lib/notifications/actions";

export function AnnounceCourseButton({
  courseId,
  courseTitle,
  recipientCount,
}: {
  courseId: string;
  courseTitle: string;
  recipientCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<{ sent: number; courseName: string } | null>(null);

  function reset() {
    setError(null);
    setDone(null);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setDone(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        const result = await announceCourseAction({
          courseId,
          title: String(fd.get("title") ?? ""),
          body: String(fd.get("body") ?? ""),
        });
        setDone(result);
        (e.target as HTMLFormElement).reset();
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Megaphone className="h-4 w-4" />
          发布课程公告
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>发布课程公告</DialogTitle>
          <DialogDescription>
            公告将以系统通知的形式发送给 <b>{courseTitle}</b> 课程下 {recipientCount} 名在读学生
            以及同课程其他任课教师。
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-success/30 bg-success-subtle/40 p-4 text-sm text-success">
              <CheckCircle2 className="mr-1 inline h-4 w-4" />
              已成功发送给 <b className="num">{done.sent}</b> 人 ·{" "}
              <b>{done.courseName}</b>
            </div>
            <div className="flex justify-end">
              <Button type="button" onClick={() => setOpen(false)}>
                完成
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input type="hidden" name="courseId" value={courseId} />
            <div className="space-y-1.5">
              <Label htmlFor="course-ann-title">标题</Label>
              <Input
                id="course-ann-title"
                name="title"
                required
                maxLength={100}
                placeholder="如：第三章作业延期提交"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="course-ann-body">内容</Label>
              <textarea
                id="course-ann-body"
                name="body"
                required
                maxLength={2000}
                rows={6}
                placeholder="公告详情..."
                className="flex w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm shadow-sm placeholder:text-subtle-foreground focus-visible:border-primary focus-visible:bg-card focus-visible:outline-none"
              />
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
              <Button type="submit" disabled={pending}>
                {pending ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Megaphone className="h-4 w-4" />
                )}
                发布
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}