"use client";

import * as React from "react";
import { Pencil } from "lucide-react";
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
import { updateCourseAction, type UpdateCourseState } from "@/app/t/courses/actions";
import type { CourseCategory } from "@prisma/client";

interface Props {
  courseId: string;
  initial: {
    title: string;
    description: string;
    category: CourseCategory;
    semester: string;
  };
}

const initialState: UpdateCourseState = {};

export function EditCourseButton({ courseId, initial }: Props) {
  const [open, setOpen] = React.useState(false);
  const [state, formAction, pending] = React.useActionState(
    async (prev: UpdateCourseState, fd: FormData) => updateCourseAction(courseId, prev, fd),
    initialState,
  );

  React.useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Pencil />
          编辑
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑课程</DialogTitle>
          <DialogDescription>修改后立即生效，班级和协作者通过下方 Tab 调整。</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="course-title">课程标题</Label>
            <Input id="course-title" name="title" defaultValue={initial.title} required />
            {state.fieldErrors?.title && (
              <p className="text-xs text-danger">{state.fieldErrors.title}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="course-desc">课程描述</Label>
            <Input
              id="course-desc"
              name="description"
              defaultValue={initial.description}
              maxLength={500}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="course-category">分类</Label>
              <select
                id="course-category"
                name="category"
                defaultValue={initial.category}
                className="flex h-9 w-full rounded-lg border border-border bg-muted px-3 text-sm focus-visible:border-primary focus-visible:bg-card focus-visible:outline-none"
                required
              >
                <option value="DATA">数据</option>
                <option value="ALGORITHM">算法</option>
                <option value="AI">人工智能</option>
                <option value="NETWORK">计算机网络</option>
                <option value="INTERDISCIPLINARY">多学科交叉</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="course-semester">学期</Label>
              <Input
                id="course-semester"
                name="semester"
                defaultValue={initial.semester}
                required
              />
            </div>
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
              {pending ? "保存中…" : "保存"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}