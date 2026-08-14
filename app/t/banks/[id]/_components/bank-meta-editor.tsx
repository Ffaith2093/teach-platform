"use client";

import * as React from "react";
import { useActionState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Settings } from "lucide-react";
import { updateBankAction, type UpdateBankState } from "@/app/t/banks/actions";

interface CourseOption {
  id: string;
  title: string;
}

const initial: UpdateBankState = {};

export function BankMetaEditor({
  bankId,
  initial: data,
  courses,
}: {
  bankId: string;
  initial: { name: string; courseId: string };
  courses: CourseOption[];
}) {
  const [state, formAction, pending] = useActionState(
    async (prev: UpdateBankState, fd: FormData) => updateBankAction(bankId, prev, fd),
    initial,
  );

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">题库信息</h2>
        </div>
        <form action={formAction} className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="meta-name">名称</Label>
            <Input id="meta-name" name="name" defaultValue={data.name} required />
            {state.fieldErrors?.name && (
              <p className="text-xs text-danger">{state.fieldErrors.name}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="meta-course">关联课程</Label>
            <select
              id="meta-course"
              name="courseId"
              defaultValue={data.courseId}
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
          {state.error && (
            <div className="rounded-lg border border-danger/30 bg-danger-subtle/40 px-3 py-2 text-xs text-danger">
              {state.error}
            </div>
          )}
          {state.ok && (
            <div className="rounded-lg border border-success/30 bg-success-subtle/40 px-3 py-2 text-xs text-success">
              已保存
            </div>
          )}
          <div className="flex justify-end border-t border-border pt-3">
            <Button type="submit" size="sm" disabled={pending}>
              <Save />
              {pending ? "保存中…" : "保存"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}