"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useActionState } from "react";
import { Settings, Trash2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  updateChapterAction,
  deleteChapterAction,
  type ChapterFormState,
} from "@/app/t/courses/[id]/chapters/actions";

export function ChapterSettingsDialog({
  chapterId,
  courseId,
  initialTitle,
  initialDescription,
}: {
  chapterId: string;
  courseId: string;
  initialTitle: string;
  initialDescription: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const initial: ChapterFormState = {};
  const [state, formAction] = useActionState(updateChapterAction, initial);

  React.useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state.ok]);

  function handleDelete() {
    if (
      !window.confirm(
        "确认删除该章节？章节下的作业/考试将保留但不再归属本章节（章节置空）。",
      )
    ) {
      return;
    }
    setDeleting(true);
    startTransition(async () => {
      try {
        await deleteChapterAction(chapterId);
        router.push(`/t/courses/${courseId}`);
      } catch (e) {
        setError((e as Error).message);
        setDeleting(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings />
          章节设置
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>章节设置</DialogTitle>
          <DialogDescription>修改章节标题与描述；删除章节为不可逆操作。</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="chapterId" value={chapterId} />
          <div className="space-y-1.5">
            <Label htmlFor="edit-chapter-title">章节标题</Label>
            <Input
              id="edit-chapter-title"
              name="title"
              defaultValue={initialTitle}
              required
              maxLength={80}
            />
            {state.fieldErrors?.title && (
              <p className="text-xs text-danger">{state.fieldErrors.title}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-chapter-desc">章节描述</Label>
            <textarea
              id="edit-chapter-desc"
              name="description"
              rows={3}
              maxLength={500}
              defaultValue={initialDescription ?? ""}
              className="flex w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm shadow-sm placeholder:text-subtle-foreground focus-visible:border-primary focus-visible:bg-card focus-visible:outline-none"
            />
            {state.fieldErrors?.description && (
              <p className="text-xs text-danger">{state.fieldErrors.description}</p>
            )}
          </div>
          {state.error && (
            <div className="rounded-lg border border-danger/30 bg-danger-subtle/40 px-3 py-2 text-xs text-danger">
              {state.error}
            </div>
          )}
          <div className="flex items-center justify-between gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDelete}
              disabled={pending || deleting}
              className="text-danger hover:bg-danger-subtle hover:text-danger"
            >
              {deleting ? <Loader2 className="animate-spin" /> : <Trash2 className="h-4 w-4" />}
              删除章节
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "保存中…" : "保存"}
              </Button>
            </div>
          </div>
          {error && (
            <div className="rounded-lg border border-danger/30 bg-danger-subtle/40 px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}