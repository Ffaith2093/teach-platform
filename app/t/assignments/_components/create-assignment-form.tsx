"use client";

import * as React from "react";
import { useActionState } from "react";
import { Check, ChevronRight, ChevronLeft, FileText, BookOpen, Code, Plus, X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { createAssignmentAction, type CreateAssignmentState } from "@/app/t/assignments/actions";
import type { Difficulty } from "@prisma/client";

interface CourseOption {
  id: string;
  title: string;
  classCount: number;
  role: "OWNER" | "ASSISTANT" | "CONTRIBUTOR";
}

interface ProblemOption {
  id: string;
  title: string;
  difficulty: Difficulty;
  tags: string[];
  isPublic: boolean;
  isMine: boolean;
}

interface PickedProblem {
  problemId: string;
  title: string;
  difficulty: Difficulty;
  score: number;
}

const STEPS = [
  { key: "course", label: "选择课程", icon: BookOpen },
  { key: "info", label: "基本信息", icon: FileText },
  { key: "problems", label: "挂载编程题", icon: Code },
] as const;

const DIFFICULTY_LABELS: Record<Difficulty, { label: string; tone: "success" | "warning" | "danger" }> = {
  EASY: { label: "入门", tone: "success" },
  MEDIUM: { label: "中等", tone: "warning" },
  HARD: { label: "进阶", tone: "danger" },
};

const initial: CreateAssignmentState = {};

export function CreateAssignmentForm({
  courses,
  problems,
}: {
  courses: CourseOption[];
  problems: ProblemOption[];
}) {
  const [state, formAction, pending] = useActionState(createAssignmentAction, initial);
  const [step, setStep] = React.useState(0);
  const [courseId, setCourseId] = React.useState<string>(courses[0]?.id ?? "");
  const [allowLate, setAllowLate] = React.useState(true);
  const [picked, setPicked] = React.useState<PickedProblem[]>([]);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [pickerSearch, setPickerSearch] = React.useState("");
  const [publishMode, setPublishMode] = React.useState<"0" | "1">("0");
  const formRef = React.useRef<HTMLFormElement>(null);

  const canNext = step === 0 ? !!courseId : step === 1 ? true : picked.length > 0;
  const totalScore = picked.reduce((sum, p) => sum + p.score, 0);

  function addProblem(p: ProblemOption) {
    if (picked.find((x) => x.problemId === p.id)) return;
    setPicked((prev) => [
      ...prev,
      { problemId: p.id, title: p.title, difficulty: p.difficulty, score: 20 },
    ]);
    setPickerOpen(false);
    setPickerSearch("");
  }

  function removeProblem(problemId: string) {
    setPicked((prev) => prev.filter((p) => p.problemId !== problemId));
  }

  function updateScore(problemId: string, score: number) {
    setPicked((prev) => prev.map((p) => (p.problemId === problemId ? { ...p, score } : p)));
  }

  function moveProblem(idx: number, dir: -1 | 1) {
    setPicked((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  // 过滤 picker 候选
  const pickedIds = new Set(picked.map((p) => p.problemId));
  const candidates = problems.filter((p) => {
    if (pickedIds.has(p.id)) return false;
    if (!pickerSearch) return true;
    const q = pickerSearch.toLowerCase();
    return p.title.toLowerCase().includes(q) || p.tags.some((t) => t.toLowerCase().includes(q));
  });

  // 默认 dueAt：7 天后的 23:59
  const defaultDueAt = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    d.setHours(23, 59, 0, 0);
    const tz = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tz).toISOString().slice(0, 16);
  })();

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Stepper */}
      <ol className="flex items-center gap-0 border-b border-border">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const active = step === i;
          const done = step > i;
          return (
            <li
              key={s.key}
              className={`flex flex-1 items-center gap-2 px-5 py-4 text-sm transition-colors ${
                active
                  ? "bg-primary-subtle text-primary"
                  : done
                    ? "bg-success-subtle/30 text-success"
                    : "text-muted-foreground"
              }`}
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : done
                      ? "bg-success text-white"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <Icon className="h-4 w-4" />
              <span className="font-medium">{s.label}</span>
              {i < STEPS.length - 1 && (
                <ChevronRight className="ml-auto h-4 w-4 text-subtle-foreground" />
              )}
            </li>
          );
        })}
      </ol>

      <form ref={formRef} action={formAction} className="p-6">
        <input type="hidden" name="courseId" value={courseId} />
        <input type="hidden" name="problems" value={JSON.stringify(picked)} />

        {/* 步骤 1：选择课程 */}
        {step === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              选择要布置作业的课程（您必须为该课程的主讲或助教）。
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {courses.map((c) => {
                const checked = courseId === c.id;
                return (
                  <label
                    key={c.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-all ${
                      checked
                        ? "border-primary bg-primary-subtle/40"
                        : "border-border bg-card hover:border-primary/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name="courseId-radio"
                      value={c.id}
                      checked={checked}
                      onChange={() => setCourseId(c.id)}
                      className="h-4 w-4 border-border text-primary focus:ring-primary"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground">{c.title}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Badge variant="primary" className="font-normal">
                          {c.role === "OWNER" ? "主讲" : "助教"}
                        </Badge>
                        <span className="num">{c.classCount} 个班级</span>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* 步骤 2：基本信息 */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="as-title">作业标题</Label>
              <Input
                id="as-title"
                name="title"
                placeholder="例：第一章 · 变量与数据类型练习"
                required
              />
              {state.fieldErrors?.title && (
                <p className="text-xs text-danger">{state.fieldErrors.title}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="as-desc">作业说明（可选）</Label>
              <textarea
                id="as-desc"
                name="description"
                rows={3}
                placeholder="作业要求、提交方式、参考资料链接…"
                maxLength={2000}
                className="flex w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm focus-visible:border-primary focus-visible:bg-card focus-visible:outline-none"
              />
              {state.fieldErrors?.description && (
                <p className="text-xs text-danger">{state.fieldErrors.description}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="as-due">截止时间</Label>
                <input
                  id="as-due"
                  name="dueAt"
                  type="datetime-local"
                  defaultValue={defaultDueAt}
                  required
                  className="flex h-9 w-full rounded-lg border border-border bg-muted px-3 text-sm focus-visible:border-primary focus-visible:bg-card focus-visible:outline-none"
                />
                {state.fieldErrors?.dueAt && (
                  <p className="text-xs text-danger">{state.fieldErrors.dueAt}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="as-late-penalty">迟交扣分（%）</Label>
                <Input
                  id="as-late-penalty"
                  name="latePenalty"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={20}
                />
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-muted/40 p-3">
              <input
                type="checkbox"
                name="allowLate"
                checked={allowLate}
                onChange={(e) => setAllowLate(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <div>
                <div className="text-sm font-medium text-foreground">允许迟交</div>
                <div className="text-xs text-muted-foreground">
                  关闭后超过截止时间的提交将被拒绝
                </div>
              </div>
            </label>
          </div>
        )}

        {/* 步骤 3：挂载编程题 */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  从您创建或公开题库的编程题中选择。已选 <b className="text-foreground num">{picked.length}</b>{" "}
                  题，总分 <b className="text-foreground num">{totalScore}</b>。
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => setPickerOpen(true)}
                disabled={problems.length === 0}
              >
                <Plus />
                添加编程题
              </Button>
            </div>

            {problems.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-8 text-center text-sm text-muted-foreground">
                <Code className="mx-auto h-6 w-6 text-subtle-foreground" />
                <p className="mt-2">您还没有任何可挂载的编程题</p>
                <p className="mt-1 text-xs text-subtle-foreground">
                  请先到「题库」创建题目，或勾选「共享到公共库」后被他人引用
                </p>
              </div>
            ) : picked.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-12 text-center text-sm text-muted-foreground">
                <Code className="mx-auto h-8 w-8 text-subtle-foreground" />
                <p className="mt-3">还没有挂载任何编程题</p>
                <p className="mt-1 text-xs text-subtle-foreground">点击右上角「添加编程题」开始选择</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {picked.map((p, i) => {
                  const diff = DIFFICULTY_LABELS[p.difficulty];
                  return (
                    <li
                      key={p.problemId}
                      className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
                    >
                      <span className="num font-mono text-xs text-subtle-foreground">
                        #{i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                          {p.title}
                          <Badge variant={diff.tone} className="font-normal">
                            {diff.label}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Label htmlFor={`score-${p.problemId}`} className="text-xs text-muted-foreground">
                          分值
                        </Label>
                        <Input
                          id={`score-${p.problemId}`}
                          type="number"
                          min={1}
                          max={1000}
                          value={p.score}
                          onChange={(e) => updateScore(p.problemId, Number(e.target.value) || 0)}
                          className="h-8 w-20 text-center num"
                        />
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          aria-label="上移"
                          onClick={() => moveProblem(i, -1)}
                          disabled={i === 0}
                          className="rounded-md p-1 text-subtle-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                        >
                          <ChevronLeft className="h-3.5 w-3.5 rotate-90" />
                        </button>
                        <button
                          type="button"
                          aria-label="下移"
                          onClick={() => moveProblem(i, 1)}
                          disabled={i === picked.length - 1}
                          className="rounded-md p-1 text-subtle-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                        >
                          <ChevronRight className="h-3.5 w-3.5 rotate-90" />
                        </button>
                        <button
                          type="button"
                          aria-label="移除"
                          onClick={() => removeProblem(p.problemId)}
                          className="rounded-md p-1.5 text-subtle-foreground transition-colors hover:bg-danger-subtle hover:text-danger"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {pickerOpen && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
                onClick={() => {
                  setPickerOpen(false);
                  setPickerSearch("");
                }}
              >
                <div
                  className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold">选择编程题</h3>
                    <button
                      type="button"
                      aria-label="关闭"
                      onClick={() => {
                        setPickerOpen(false);
                        setPickerSearch("");
                      }}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="relative mt-3">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
                    <input
                      autoFocus
                      value={pickerSearch}
                      onChange={(e) => setPickerSearch(e.target.value)}
                      placeholder="按题名或标签筛选…"
                      className="flex h-9 w-full rounded-lg border border-border bg-muted pl-9 pr-3 text-sm focus-visible:border-primary focus-visible:bg-card focus-visible:outline-none"
                    />
                  </div>
                  <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-border">
                    {candidates.length === 0 ? (
                      <p className="p-6 text-center text-sm text-muted-foreground">
                        没有匹配的编程题
                      </p>
                    ) : (
                      <ul className="divide-y divide-border">
                        {candidates.map((p) => {
                          const diff = DIFFICULTY_LABELS[p.difficulty];
                          return (
                            <li
                              key={p.id}
                              className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
                              onClick={() => addProblem(p)}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                                  {p.title}
                                  <Badge variant={diff.tone} className="font-normal">
                                    {diff.label}
                                  </Badge>
                                  {p.isMine ? (
                                    <Badge variant="primary" className="font-normal">
                                      我的
                                    </Badge>
                                  ) : (
                                    <Badge variant="default" className="font-normal">
                                      公开库
                                    </Badge>
                                  )}
                                </div>
                                {p.tags.length > 0 && (
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    {p.tags.slice(0, 4).join(" · ")}
                                  </div>
                                )}
                              </div>
                              <Button type="button" size="sm" variant="outline">
                                选择
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {state.error && (
          <div className="mt-4 rounded-lg border border-danger/30 bg-danger-subtle/40 px-3 py-2 text-xs text-danger">
            {state.error}
          </div>
        )}

        <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
          <Button
            type="button"
            variant="outline"
            disabled={step === 0}
            onClick={() => setStep((s) => s - 1)}
          >
            <ChevronLeft />
            上一步
          </Button>
          <div className="flex items-center gap-2">
            {step < STEPS.length - 1 ? (
              <Button type="button" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
                下一步
                <ChevronRight />
              </Button>
            ) : (
              <>
                <Button
                  type="submit"
                  variant="outline"
                  disabled={pending || !canNext}
                  onClick={() => setPublishMode("0")}
                >
                  {pending && publishMode === "0" ? "保存中…" : "保存草稿"}
                </Button>
                <Button
                  type="submit"
                  disabled={pending || !canNext}
                  onClick={() => setPublishMode("1")}
                >
                  {pending && publishMode === "1" ? "发布中…" : "直接发布"}
                </Button>
              </>
            )}
          </div>
        </div>

        <input type="hidden" name="publish" value={publishMode} />
      </form>
    </div>
  );
}