"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, BookOpen, FileText, ClipboardCheck, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useActionState } from "react";
import { createChapterAction, type ChapterFormState } from "@/app/t/courses/[id]/chapters/actions";

interface ChapterItem {
  id: string;
  title: string;
  description: string | null;
  order: number;
  assignmentCount: number;
  examCount: number;
}

export function ChaptersCard({
  courseId,
  chapters,
  canEdit,
}: {
  courseId: string;
  chapters: ChapterItem[];
  canEdit: boolean;
}) {
  const [addOpen, setAddOpen] = React.useState(false);
  const initial: ChapterFormState = {};
  const [state, formAction, pending] = useActionState(createChapterAction, initial);

  React.useEffect(() => {
    if (state.ok) {
      setAddOpen(false);
    }
  }, [state.ok]);

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <BookOpen className="h-4 w-4 text-primary" />
              章节
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              按教学顺序组织本课程的作业与考试。{!canEdit && "(仅主讲/助教可编辑)"}
            </p>
          </div>
          {canEdit && (
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus />
                  新建章节
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>新建章节</DialogTitle>
                  <DialogDescription>
                    章节标题与描述，后续可在本课程章节详情页调整顺序。
                  </DialogDescription>
                </DialogHeader>
                <form action={formAction} className="space-y-4">
                  <input type="hidden" name="courseId" value={courseId} />
                  <div className="space-y-1.5">
                    <Label htmlFor="chapter-title">章节标题</Label>
                    <Input
                      id="chapter-title"
                      name="title"
                      placeholder="如：第 1 章 Python 基础"
                      required
                      maxLength={80}
                    />
                    {state.fieldErrors?.title && (
                      <p className="text-xs text-danger">{state.fieldErrors.title}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="chapter-desc">章节描述（可选）</Label>
                    <textarea
                      id="chapter-desc"
                      name="description"
                      rows={3}
                      maxLength={500}
                      placeholder="本章主要讲什么…"
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
                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                      取消
                    </Button>
                    <Button type="submit" disabled={pending}>
                      {pending ? "创建中…" : "创建"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <div className="mt-4">
          {chapters.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-10 text-center text-sm text-muted-foreground">
              <BookOpen className="mx-auto h-6 w-6 text-subtle-foreground" />
              <p className="mt-2">本课程暂无章节，从这里开始组织教学顺序</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {chapters.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/t/courses/${courseId}/chapters/${c.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="primary" className="num font-mono">
                          第 {c.order} 章
                        </Badge>
                        <span className="truncate text-sm font-medium text-foreground">
                          {c.title}
                        </span>
                      </div>
                      {c.description && (
                        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                          {c.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1 num">
                        <FileText className="h-3 w-3" />
                        {c.assignmentCount}
                      </span>
                      <span className="inline-flex items-center gap-1 num">
                        <ClipboardCheck className="h-3 w-3" />
                        {c.examCount}
                      </span>
                      <ChevronRight className="h-4 w-4 text-subtle-foreground" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}