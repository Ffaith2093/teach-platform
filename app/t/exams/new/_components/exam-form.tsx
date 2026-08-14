"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Save } from "lucide-react";
import { createExamAction } from "@/app/t/exams/actions";

interface CourseOption {
  id: string;
  title: string;
}

export function ExamForm({ courses }: { courses: CourseOption[] }) {
  const [state, formAction, pending] = useActionState(createExamAction, undefined);

  // 默认开考时间 = 下个整点（5 分钟后）
  const defaultOpenAt = (() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 30, 0, 0);
    return toLocalDatetimeInput(d);
  })();
  const defaultCloseAt = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    d.setHours(23, 0, 0, 0);
    return toLocalDatetimeInput(d);
  })();

  // 本地表单状态：控制 publish 按钮文案 + 切换
  const [publishMode, setPublishMode] = React.useState(false);

  return (
    <Card>
      <CardContent className="p-6">
        <form action={formAction} className="space-y-6">
          {/* 课程 */}
          <Field
            label="课程"
            error={state?.fieldErrors?.courseId}
            required
          >
            <select
              name="courseId"
              required
              defaultValue=""
              className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:border-primary focus-visible:outline-none"
            >
              <option value="" disabled>
                请选择课程
              </option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </Field>

          {/* 标题 */}
          <Field label="试卷标题" error={state?.fieldErrors?.title} required>
            <input
              name="title"
              type="text"
              maxLength={100}
              required
              placeholder="如：Python 基础语法期中考试"
              className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:border-primary focus-visible:outline-none"
            />
          </Field>

          {/* 时间 */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field
              label="开考时间"
              error={state?.fieldErrors?.openAt}
              required
            >
              <input
                name="openAt"
                type="datetime-local"
                required
                defaultValue={defaultOpenAt}
                className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:border-primary focus-visible:outline-none"
              />
            </Field>
            <Field
              label="结束时间"
              error={state?.fieldErrors?.closeAt}
              required
            >
              <input
                name="closeAt"
                type="datetime-local"
                required
                defaultValue={defaultCloseAt}
                className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:border-primary focus-visible:outline-none"
              />
            </Field>
            <Field
              label="时长（分钟）"
              error={state?.fieldErrors?.durationMin}
              required
              hint="学生进入考试后必须在此时长内提交"
            >
              <input
                name="durationMin"
                type="number"
                min={5}
                max={360}
                defaultValue={60}
                className="num h-9 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:border-primary focus-visible:outline-none"
              />
            </Field>
          </div>

          {/* 答题模式 */}
          <Field
            label="作答要求"
            hint="随机题序与选项可降低作弊"
          >
            <div className="grid grid-cols-1 gap-3 rounded-md border border-border bg-card p-3 sm:grid-cols-3">
              <CheckField
                name="shuffleQuestion"
                label="随机题目顺序"
                defaultChecked
              />
              <CheckField
                name="shuffleOption"
                label="随机选项顺序"
                defaultChecked
              />
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  结果展示
                </label>
                <select
                  name="showResultMode"
                  defaultValue="AFTER_CLOSE"
                  className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:border-primary focus-visible:outline-none"
                >
                  <option value="IMMEDIATELY">交卷后立即</option>
                  <option value="AFTER_CLOSE">考试结束后</option>
                  <option value="AFTER_GRADED">全部批改后</option>
                  <option value="NEVER">不展示</option>
                </select>
              </div>
            </div>
          </Field>

          {/* 说明 */}
          <Field
            label="考试说明（可选）"
            error={state?.fieldErrors?.instructions}
          >
            <textarea
              name="instructions"
              rows={4}
              maxLength={2000}
              placeholder="面向考生的考场规则、注意事项等"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus-visible:border-primary focus-visible:outline-none"
            />
          </Field>

          {/* 发布开关 */}
          <div className="rounded-lg border border-border bg-muted/40 p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                name="publish"
                value="1"
                checked={publishMode}
                onChange={(e) => setPublishMode(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">
                  {publishMode ? "立即发布" : "保存为草稿"}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {publishMode
                    ? "学生可在开考时间参与考试"
                    : "后续可在详情页补全题目后再发布"}
                </p>
              </div>
            </label>
          </div>

          {state?.error && (
            <div className="rounded-lg border border-danger/30 bg-danger-subtle/40 px-3 py-2 text-xs text-danger">
              {state.error}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
            <Link
              href="/t/exams"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
              取消
            </Link>
            <Button type="submit" disabled={pending}>
              <Save />
              {pending ? "提交中…" : publishMode ? "创建并发布" : "保存为草稿"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-[11px] text-subtle-foreground">{hint}</p>}
      {error && <p className="mt-1 text-[11px] text-danger">{error}</p>}
    </div>
  );
}

function CheckField({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
      />
      <span className="text-sm text-foreground">{label}</span>
    </label>
  );
}

function toLocalDatetimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
