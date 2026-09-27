"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ChevronLeft, Save, BookOpen, Plus, Trash2 } from "lucide-react";
import { createExamAction } from "@/app/t/exams/actions";

interface CourseOption {
  id: string;
  title: string;
  chapters: { id: string; title: string; order: number }[];
}

export function ExamForm({
  courses,
  banks,
  initialCourseId,
  initialChapterId,
}: {
  courses: CourseOption[];
  banks: { id: string; name: string; questionCount: number }[];
  initialCourseId?: string | null;
  initialChapterId?: string | null;
}) {
  const [state, formAction, pending] = useActionState(createExamAction, undefined);

  const [courseId, setCourseId] = React.useState<string>(
    initialCourseId && courses.some((c) => c.id === initialCourseId)
      ? initialCourseId
      : courses[0]?.id ?? "",
  );
  const [chapterId, setChapterId] = React.useState<string>(initialChapterId ?? "");

  const currentCourse = courses.find((c) => c.id === courseId);
  const courseChapters = currentCourse?.chapters ?? [];

  // 切课程时清掉 chapterId（若不属于新课程）
  React.useEffect(() => {
    if (!courseChapters.some((c) => c.id === chapterId)) {
      setChapterId("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  // 默认开考时间 = 下个整点（30 分钟后）
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
  const [mode, setMode] = React.useState<"FIXED" | "DRAW">("FIXED");
  const [bankId, setBankId] = React.useState(banks[0]?.id ?? "");
  const [rules, setRules] = React.useState([{ type: "SINGLE_CHOICE", difficulty: "", tags: "", count: 5, scorePerQuestion: 2 }]);
  const ruleData = {
    bankId,
    rules: rules.map((rule) => ({
      type: rule.type,
      ...(rule.difficulty ? { difficulty: rule.difficulty } : {}),
      ...(rule.tags.trim() ? { tags: rule.tags.split(",").map((tag) => tag.trim()).filter(Boolean) } : {}),
      count: Number(rule.count),
      scorePerQuestion: Number(rule.scorePerQuestion),
    })),
  };

  function updateRule(index: number, patch: Partial<(typeof rules)[number]>) {
    setRules((current) => current.map((rule, i) => i === index ? { ...rule, ...patch } : rule));
  }

  return (
    <Card>
      <CardContent className="p-6">
        <form action={formAction} className="space-y-6">
          <input type="hidden" name="courseId" value={courseId} />
          <input type="hidden" name="chapterId" value={chapterId} />
          <input type="hidden" name="mode" value={mode} />
          <input type="hidden" name="drawRules" value={mode === "DRAW" ? JSON.stringify(ruleData) : "null"} />

          {/* 课程 */}
          <Field
            label="课程"
            error={state?.fieldErrors?.courseId}
            required
          >
            <select
              required
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
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

          {/* 所属章节（可选） */}
          <div className="space-y-1.5">
            <Label htmlFor="exam-chapter">
              <BookOpen className="mr-1 inline h-3.5 w-3.5 text-primary" />
              所属章节（可选）
            </Label>
            {courseChapters.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                所选课程暂无章节，可在课程详情页先创建章节
              </p>
            ) : (
              <select
                id="exam-chapter"
                value={chapterId}
                onChange={(e) => setChapterId(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:border-primary focus-visible:outline-none"
              >
                <option value="">未分组</option>
                {courseChapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    第 {c.order} 章 · {c.title}
                  </option>
                ))}
              </select>
            )}
          </div>

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

          <div className="space-y-3 border-t border-border pt-5">
            <Label>组卷方式</Label>
            <div className="inline-flex rounded-md border border-border p-1">
              {(["FIXED", "DRAW"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => { setMode(value); if (value === "FIXED") setPublishMode(false); }}
                  className={`rounded px-3 py-1.5 text-sm ${mode === value ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                >
                  {value === "FIXED" ? "固定组卷" : "题库抽题"}
                </button>
              ))}
            </div>
            {mode === "DRAW" && (
              <div className="space-y-3">
                <Field label="题库" required>
                  <select value={bankId} onChange={(event) => setBankId(event.target.value)} className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm">
                    {banks.length === 0 && <option value="">暂无题库</option>}
                    {banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.name} ({bank.questionCount} 题)</option>)}
                  </select>
                </Field>
                {rules.map((rule, index) => (
                  <div key={index} className="grid grid-cols-2 gap-2 border-b border-border pb-3 md:grid-cols-[1fr_1fr_1fr_80px_80px_32px]">
                    <select aria-label={`规则 ${index + 1} 题型`} value={rule.type} onChange={(event) => updateRule(index, { type: event.target.value })} className="h-9 rounded border border-border bg-card px-2 text-sm">
                      <option value="SINGLE_CHOICE">单选题</option><option value="FILL_BLANK">填空题</option><option value="CODE_BLANK">代码填空</option><option value="PROGRAMMING">编程题</option>
                    </select>
                    <select aria-label={`规则 ${index + 1} 难度`} value={rule.difficulty} onChange={(event) => updateRule(index, { difficulty: event.target.value })} className="h-9 rounded border border-border bg-card px-2 text-sm">
                      <option value="">全部难度</option><option value="EASY">简单</option><option value="MEDIUM">中等</option><option value="HARD">困难</option>
                    </select>
                    <input aria-label={`规则 ${index + 1} 标签`} value={rule.tags} onChange={(event) => updateRule(index, { tags: event.target.value })} placeholder="标签（逗号分隔）" className="h-9 min-w-0 rounded border border-border bg-card px-2 text-sm" />
                    <input aria-label={`规则 ${index + 1} 数量`} type="number" min={1} max={50} value={rule.count} onChange={(event) => updateRule(index, { count: Number(event.target.value) })} className="h-9 w-full rounded border border-border bg-card px-2 text-sm" />
                    <input aria-label={`规则 ${index + 1} 每题分值`} type="number" min={1} max={100} value={rule.scorePerQuestion} onChange={(event) => updateRule(index, { scorePerQuestion: Number(event.target.value) })} className="h-9 w-full rounded border border-border bg-card px-2 text-sm" />
                    <button type="button" title="删除规则" aria-label="删除规则" disabled={rules.length === 1} onClick={() => setRules((current) => current.filter((_, i) => i !== index))} className="flex h-9 items-center justify-center text-muted-foreground disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" disabled={rules.length >= 12} onClick={() => setRules((current) => [...current, { type: "SINGLE_CHOICE", difficulty: "", tags: "", count: 1, scorePerQuestion: 2 }])}><Plus className="h-4 w-4" />添加规则</Button>
              </div>
            )}
          </div>

          {/* 发布开关 */}
          <div className="rounded-lg border border-border bg-muted/40 p-4">
            <label className={`flex items-start gap-3 ${mode === "DRAW" ? "cursor-pointer" : "opacity-60"}`}>
              <input
                type="checkbox"
                name="publish"
                value="1"
                checked={publishMode}
                disabled={mode === "FIXED"}
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
                    : mode === "FIXED" ? "创建后在试卷详情添加题目，再发布" : "确认抽题池后可在详情页发布"}
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
