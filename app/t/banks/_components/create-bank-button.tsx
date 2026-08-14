"use client";

import * as React from "react";
import { useActionState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createBankAction,
  type CreateBankState,
} from "@/app/t/banks/actions";

interface CourseOption {
  id: string;
  title: string;
}

const initial: CreateBankState = {};

export function CreateBankButton({ courses = [] }: { courses?: CourseOption[] }) {
  const [open, setOpen] = React.useState(false);
  const [state, formAction, pending] = useActionState(createBankAction, initial);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        新建题库
      </Button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">新建题库</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form action={formAction} className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="bank-name">题库名称</Label>
                <Input
                  id="bank-name"
                  name="name"
                  required
                  placeholder="例：Python 入门题库"
                />
                {state.fieldErrors?.name && (
                  <p className="text-xs text-danger">{state.fieldErrors.name}</p>
                )}
              </div>
              {courses.length > 0 && (
                <div className="space-y-1.5">
                  <Label htmlFor="bank-course">关联课程（可选）</Label>
                  <select
                    id="bank-course"
                    name="courseId"
                    defaultValue=""
                    className="flex h-9 w-full rounded-lg border border-border bg-muted px-3 text-sm focus-visible:border-primary focus-visible:bg-card focus-visible:outline-none"
                  >
                    <option value="">不关联</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
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
                  {pending ? "创建中…" : "创建"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}