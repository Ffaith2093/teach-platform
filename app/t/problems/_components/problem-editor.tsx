"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plus,
  Trash2,
  Save,
  PlayCircle,
  CheckCircle2,
  XCircle,
  Code,
  Tag,
  X,
  Sparkles,
  Eye,
  EyeOff,
  GripVertical,
  ArrowUp,
  ArrowDown,
  ListTree,
} from "lucide-react";
import type { Difficulty } from "@prisma/client";
import {
  createProblemAction,
  updateProblemAction,
  addTestCaseAction,
  updateTestCaseAction,
  removeTestCaseAction,
  batchAddTestCasesAction,
  type CreateProblemState,
  type UpdateProblemState,
} from "@/app/t/problems/actions";

const DIFFICULTY_OPTIONS: Array<{ value: Difficulty; label: string; stars: number; tone: "success" | "warning" | "danger" }> = [
  { value: "EASY", label: "入门", stars: 1, tone: "success" },
  { value: "MEDIUM", label: "中等", stars: 2, tone: "warning" },
  { value: "HARD", label: "进阶", stars: 3, tone: "danger" },
];

interface TestCase {
  id: string;
  input: string;
  expected: string;
  isSample: boolean;
  score: number;
  order: number;
}

interface ProblemEditorProps {
  mode: "new" | "edit";
  problemId?: string;
  initial: {
    title: string;
    description: string;
    difficulty: Difficulty;
    timeLimitMs: number;
    memoryLimitMb: number;
    splitInputByWhitespace: boolean;
    starterCode: string;
    referenceSolution: string;
    tags: string[];
    isPublic: boolean;
  };
  testCases: TestCase[];
}

const initialCreate: CreateProblemState = {};
const initialUpdate: UpdateProblemState = {};

export function ProblemEditor({ mode, problemId, initial, testCases: initialTestCases }: ProblemEditorProps) {
  const router = useRouter();
  const isEdit = mode === "edit";

  const [tags, setTags] = React.useState<string[]>(initial.tags);
  const [tagInput, setTagInput] = React.useState("");
  const [difficulty, setDifficulty] = React.useState<Difficulty>(initial.difficulty);
  const [testCases, setTestCases] = React.useState<TestCase[]>(initialTestCases);

  React.useEffect(() => {
    setTestCases(initialTestCases);
  }, [initialTestCases]);

  // 顶部表单 action
  const [createState, createAction, creating] = useActionState(createProblemAction, initialCreate);
  const [updateState, updateAction, updating] = useActionState(
    async (prev: UpdateProblemState, fd: FormData) => {
      if (!problemId) return { error: "缺少题目 ID" };
      return updateProblemAction(problemId, prev, fd);
    },
    initialUpdate,
  );
  const formAction = isEdit ? updateAction : createAction;
  const formState = isEdit ? updateState : createState;
  const formPending = isEdit ? updating : creating;

  function addTag() {
    const t = tagInput.trim();
    if (!t || tags.includes(t)) return;
    setTags([...tags, t]);
    setTagInput("");
  }

  function removeTag(t: string) {
    setTags(tags.filter((x) => x !== t));
  }

  const totalScore = testCases.reduce((s, t) => s + t.score, 0);
  const sampleCount = testCases.filter((t) => t.isSample).length;
  const hiddenCount = testCases.length - sampleCount;

  return (
    <div className="flex flex-col gap-6">
      {/* 基本信息卡 */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">基本信息</h2>
            <span className="text-xs text-muted-foreground">
              <span className="num">{totalScore}</span> 分 ·{" "}
              <span className="num">{sampleCount}</span> 样例 ·{" "}
              <span className="num">{hiddenCount}</span> 隐藏
            </span>
          </div>

          <form action={formAction} className="mt-4 space-y-4">
            <input type="hidden" name="tags" value={JSON.stringify(tags)} />

            <div className="space-y-1.5">
              <Label htmlFor="prob-title">题目标题</Label>
              <Input
                id="prob-title"
                name="title"
                defaultValue={initial.title}
                placeholder="例：两数之和"
                required
              />
              {formState.fieldErrors?.title && (
                <p className="text-xs text-danger">{formState.fieldErrors.title}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>难度</Label>
              <div className="flex gap-2">
                {DIFFICULTY_OPTIONS.map((opt) => {
                  const checked = difficulty === opt.value;
                  return (
                    <label
                      key={opt.value}
                      className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all ${
                        checked
                          ? "border-primary bg-primary-subtle/40"
                          : "border-border bg-card hover:border-primary/40"
                      }`}
                    >
                      <input
                        type="radio"
                        name="difficulty"
                        value={opt.value}
                        checked={checked}
                        onChange={() => setDifficulty(opt.value)}
                        className="sr-only"
                      />
                      <Badge variant={opt.tone} className="font-normal">
                        {opt.label}
                      </Badge>
                      <span className="text-warning text-xs">{"★".repeat(opt.stars)}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>标签</Label>
              <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-muted p-2">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-md bg-card px-2 py-1 text-xs"
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() => removeTag(t)}
                      className="text-subtle-foreground hover:text-danger"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder={tags.length === 0 ? "输入后回车添加" : "+"}
                  className="min-w-[120px] flex-1 bg-transparent px-1 py-1 text-xs outline-none placeholder:text-subtle-foreground"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="time-limit">时间限制（ms）</Label>
                <Input
                  id="time-limit"
                  name="timeLimitMs"
                  type="number"
                  min={100}
                  max={30000}
                  defaultValue={initial.timeLimitMs}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mem-limit">内存限制（MB）</Label>
                <Input
                  id="mem-limit"
                  name="memoryLimitMb"
                  type="number"
                  min={16}
                  max={1024}
                  defaultValue={initial.memoryLimitMb}
                />
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
              <input
                type="checkbox"
                name="splitInputByWhitespace"
                defaultChecked={initial.splitInputByWhitespace}
                className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <div>
                <div className="text-sm font-medium text-foreground">
                  <ListTree className="mr-1 inline h-3.5 w-3.5 text-primary" />
                  按空白拆分输入
                </div>
                <div className="text-xs text-muted-foreground">
                  将空格、Tab 和换行分隔的数据转换为每项一行，学生可用连续的 input() 读取
                </div>
              </div>
            </label>

            <div className="space-y-1.5">
              <Label htmlFor="prob-desc">题干（Markdown）</Label>
              <textarea
                id="prob-desc"
                name="description"
                rows={6}
                defaultValue={initial.description}
                placeholder="## 题目描述&#10;&#10;给定两个整数 a 和 b，求它们的和。&#10;&#10;## 输入格式&#10;一行，两个整数。&#10;&#10;## 输出格式&#10;一个整数。"
                required
                className="flex w-full rounded-lg border border-border bg-muted px-3 py-2 font-mono text-sm focus-visible:border-primary focus-visible:bg-card focus-visible:outline-none"
              />
              {formState.fieldErrors?.description && (
                <p className="text-xs text-danger">{formState.fieldErrors.description}</p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="starter">初始代码（可选）</Label>
                <textarea
                  id="starter"
                  name="starterCode"
                  rows={4}
                  defaultValue={initial.starterCode}
                  placeholder="# 学生看到的代码模板"
                  className="flex w-full rounded-lg border border-border bg-muted px-3 py-2 font-mono text-xs focus-visible:border-primary focus-visible:bg-card focus-visible:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ref">参考答案（教师可见）</Label>
                <textarea
                  id="ref"
                  name="referenceSolution"
                  rows={4}
                  defaultValue={initial.referenceSolution}
                  placeholder="# 用于跑测试用例的参考解答"
                  className="flex w-full rounded-lg border border-border bg-muted px-3 py-2 font-mono text-xs focus-visible:border-primary focus-visible:bg-card focus-visible:outline-none"
                />
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
              <input
                type="checkbox"
                name="isPublic"
                defaultChecked={initial.isPublic}
                className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <div>
                <div className="text-sm font-medium text-foreground">
                  <Sparkles className="mr-1 inline h-3.5 w-3.5 text-accent" />
                  共享到公共题库
                </div>
                <div className="text-xs text-muted-foreground">
                  开启后其他教师可在创建作业时引用此题目
                </div>
              </div>
            </label>

            {formState.error && (
              <div className="rounded-lg border border-danger/30 bg-danger-subtle/40 px-3 py-2 text-xs text-danger">
                {formState.error}
              </div>
            )}
            {formState.ok && (
              <div className="rounded-lg border border-success/30 bg-success-subtle/40 px-3 py-2 text-xs text-success">
                已保存
              </div>
            )}

            <div className="flex justify-end border-t border-border pt-4">
              <Button type="submit" disabled={formPending}>
                <Save />
                {formPending ? "保存中…" : isEdit ? "保存基本信息" : "创建题目"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 测试用例卡 */}
      {isEdit && problemId && (
        <TestCasesSection problemId={problemId} testCases={testCases} setTestCases={setTestCases} />
      )}
    </div>
  );
}

function TestCasesSection({
  problemId,
  testCases,
  setTestCases,
}: {
  problemId: string;
  testCases: TestCase[];
  setTestCases: React.Dispatch<React.SetStateAction<TestCase[]>>;
}) {
  const [batchOpen, setBatchOpen] = React.useState(false);
  const [batchSample, setBatchSample] = React.useState(false);

  const [addState, addAction, addingPending] = useActionState(
    async (prev: { error?: string; ok?: boolean } | undefined, fd: FormData) =>
      addTestCaseAction(problemId, prev, fd),
    undefined,
  );

  const [batchState, batchAction, batchPending] = useActionState(
    async (prev: { error?: string; ok?: boolean } | undefined, fd: FormData) =>
      batchAddTestCasesAction(problemId, prev, fd),
    undefined,
  );

  // 添加成功后用 router.refresh 拉取真实数据
  const router = useRouter();
  React.useEffect(() => {
    if (addState?.ok || batchState?.ok) {
      router.refresh();
      setBatchOpen(false);
    }
  }, [addState?.ok, batchState?.ok, router]);

  function moveTestCase(idx: number, dir: -1 | 1) {
    setTestCases((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next.map((tc, i) => ({ ...tc, order: i }));
    });
  }

  function handleRemove(testCaseId: string) {
    if (!confirm("确定删除这个测试用例吗？")) return;
    setTestCases((prev) => prev.filter((t) => t.id !== testCaseId));
    void removeTestCaseAction(problemId, testCaseId);
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">测试用例</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              样例对学生可见，隐藏用例仅教师可见。「参考答案」跑全部用例前请确认分值设置正确。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setBatchOpen(true)}>
              批量粘贴
            </Button>
          </div>
        </div>

        {/* 添加单行 */}
        <form action={addAction} className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">添加新用例</span>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                name="isSample"
                className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
              />
              作为样例
            </label>
          </div>
          <div className="mt-2 grid grid-cols-12 gap-2">
            <textarea
              name="input"
              rows={2}
              placeholder="输入（stdin，可为空）"
              className="col-span-5 flex w-full rounded-lg border border-border bg-card px-3 py-2 font-mono text-xs focus-visible:border-primary focus-visible:outline-none"
            />
            <textarea
              name="expected"
              rows={2}
              required
              placeholder="期望输出（stdout）"
              className="col-span-5 flex w-full rounded-lg border border-border bg-card px-3 py-2 font-mono text-xs focus-visible:border-primary focus-visible:outline-none"
            />
            <div className="col-span-1 flex items-center">
              <input
                name="score"
                type="number"
                min={0}
                max={1000}
                defaultValue={10}
                className="flex h-9 w-full rounded-lg border border-border bg-card px-2 text-center text-xs num focus-visible:border-primary focus-visible:outline-none"
                title="分值"
              />
            </div>
            <div className="col-span-1 flex items-center">
              <Button type="submit" size="sm" disabled={addingPending} className="w-full">
                {addingPending ? "…" : "添加"}
              </Button>
            </div>
          </div>
          {addState?.error && (
            <p className="mt-2 text-xs text-danger">{addState.error}</p>
          )}
        </form>

        {/* 用例列表 */}
        {testCases.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-10 text-center text-sm text-muted-foreground">
            <Code className="mx-auto h-6 w-6 text-subtle-foreground" />
            <p className="mt-2">还没有测试用例</p>
            <p className="mt-1 text-xs text-subtle-foreground">填写上方表单或使用「批量粘贴」</p>
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {testCases.map((tc, idx) => (
              <TestCaseRow
                key={tc.id}
                tc={tc}
                idx={idx}
                total={testCases.length}
                onMove={(dir) => moveTestCase(idx, dir)}
                onRemove={() => handleRemove(tc.id)}
                onUpdate={async (data) => {
                  const fd = new FormData();
                  fd.set("input", data.input);
                  fd.set("expected", data.expected);
                  if (data.isSample) fd.set("isSample", "on");
                  fd.set("score", String(data.score));
                  setTestCases((prev) =>
                    prev.map((t) => (t.id === tc.id ? { ...t, ...data } : t)),
                  );
                  await updateTestCaseAction(problemId, tc.id, undefined, fd);
                }}
              />
            ))}
          </ul>
        )}

        {/* 批量粘贴 Dialog */}
        {batchOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={() => setBatchOpen(false)}
          >
            <div
              className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold">批量粘贴测试用例</h3>
                <button
                  type="button"
                  onClick={() => setBatchOpen(false)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                每行一个用例，格式：<code className="rounded bg-muted px-1">输入|||期望输出|||分值</code>，分值可省略默认 10
              </p>
              <form action={batchAction} className="mt-3 space-y-3">
                <input
                  type="hidden"
                  name="isSample"
                  value={batchSample ? "on" : ""}
                />
                <textarea
                  name="bulk"
                  rows={8}
                  required
                  placeholder={`2 7\n11 15|||0 1|||10\n3 2\n3 4|||0 1|||10`}
                  className="flex w-full rounded-lg border border-border bg-muted px-3 py-2 font-mono text-xs focus-visible:border-primary focus-visible:bg-card focus-visible:outline-none"
                />
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={batchSample}
                    onChange={(e) => setBatchSample(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-border text-primary"
                  />
                  全部作为样例
                </label>
                {batchState?.error && (
                  <p className="text-xs text-danger">{batchState.error}</p>
                )}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setBatchOpen(false)}>
                    取消
                  </Button>
                  <Button type="submit" disabled={batchPending}>
                    {batchPending ? "导入中…" : "导入"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TestCaseRow({
  tc,
  idx,
  total,
  onMove,
  onRemove,
  onUpdate,
}: {
  tc: TestCase;
  idx: number;
  total: number;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onUpdate: (data: { input: string; expected: string; isSample: boolean; score: number }) => Promise<void>;
}) {
  const [input, setInput] = React.useState(tc.input);
  const [expected, setExpected] = React.useState(tc.expected);
  const [isSample, setIsSample] = React.useState(tc.isSample);
  const [score, setScore] = React.useState(tc.score);
  const [dirty, setDirty] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    setInput(tc.input);
    setExpected(tc.expected);
    setIsSample(tc.isSample);
    setScore(tc.score);
    setDirty(false);
  }, [tc.id]);

  function handleSave() {
    startTransition(async () => {
      await onUpdate({ input, expected, isSample, score });
      setDirty(false);
    });
  }

  const dirty2 =
    dirty ||
    input !== tc.input ||
    expected !== tc.expected ||
    isSample !== tc.isSample ||
    score !== tc.score;

  return (
    <li className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <div className="flex flex-col items-center text-subtle-foreground">
          <button
            type="button"
            disabled={idx === 0}
            onClick={() => onMove(-1)}
            className="rounded p-0.5 hover:bg-muted disabled:opacity-30"
          >
            <ArrowUp className="h-3 w-3" />
          </button>
          <span className="num font-mono text-[10px]">#{idx + 1}</span>
          <button
            type="button"
            disabled={idx === total - 1}
            onClick={() => onMove(1)}
            className="rounded p-0.5 hover:bg-muted disabled:opacity-30"
          >
            <ArrowDown className="h-3 w-3" />
          </button>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {isSample ? (
              <Badge variant="success" className="font-normal">
                样例
              </Badge>
            ) : (
              <Badge variant="default" className="font-normal">
                隐藏
              </Badge>
            )}
            <label className="flex cursor-pointer items-center gap-1 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={isSample}
                onChange={(e) => {
                  setIsSample(e.target.checked);
                  setDirty(true);
                }}
                className="h-3 w-3 rounded border-border text-primary"
              />
              切换样例/隐藏
            </label>
            <div className="ml-auto flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">分值</span>
              <input
                type="number"
                min={0}
                max={1000}
                value={score}
                onChange={(e) => {
                  setScore(Number(e.target.value) || 0);
                  setDirty(true);
                }}
                className="h-7 w-16 rounded border border-border bg-muted px-2 text-center num text-foreground focus-visible:border-primary focus-visible:outline-none"
              />
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <textarea
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setDirty(true);
              }}
              rows={2}
              placeholder="输入"
              className="flex w-full rounded border border-border bg-muted px-2 py-1.5 font-mono text-xs focus-visible:border-primary focus-visible:bg-card focus-visible:outline-none"
            />
            <textarea
              value={expected}
              onChange={(e) => {
                setExpected(e.target.value);
                setDirty(true);
              }}
              rows={2}
              placeholder="期望输出"
              className="flex w-full rounded border border-border bg-muted px-2 py-1.5 font-mono text-xs focus-visible:border-primary focus-visible:bg-card focus-visible:outline-none"
            />
          </div>
        </div>
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty2 || pending}
            className="rounded-md p-1.5 text-success transition-colors hover:bg-success-subtle disabled:opacity-30"
            title="保存"
          >
            <CheckCircle2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-md p-1.5 text-subtle-foreground transition-colors hover:bg-danger-subtle hover:text-danger"
            title="删除"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </li>
  );
}
