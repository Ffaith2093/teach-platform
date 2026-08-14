"use client";

import * as React from "react";
import { useActionState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Trash2,
  X,
  ListChecks,
  Code,
  Hash,
  FileCode,
  Loader2,
} from "lucide-react";
import type { Difficulty, QuestionType } from "@prisma/client";
import { addQuestionToExamAction, removeQuestionFromExamAction, type AddQuestionState } from "@/app/t/exams/actions";

type QuestionRow = {
  eqId: string;
  questionId: string;
  type: QuestionType;
  content: string;
  difficulty: Difficulty;
  score: number;
  order: number;
  // type-specific（编程题从 problemId 拉标题）
  detail?: {
    options?: { key: string; text: string }[];
    answer?: unknown;
    problemTitle?: string;
    problemId?: string;
  };
};

const DIFFICULTY_LABELS: Record<Difficulty, { label: string; tone: "success" | "warning" | "danger" }> = {
  EASY: { label: "入门", tone: "success" },
  MEDIUM: { label: "中等", tone: "warning" },
  HARD: { label: "进阶", tone: "danger" },
};

const TYPE_LABEL: Record<QuestionType, string> = {
  SINGLE_CHOICE: "单选",
  FILL_BLANK: "填空",
  CODE_BLANK: "代码填空",
  PROGRAMMING: "编程",
};

export function QuestionsPanel({
  examId,
  questions,
  availableProblems,
  isDraft,
}: {
  examId: string;
  questions: QuestionRow[];
  availableProblems: Array<{
    id: string;
    title: string;
    difficulty: Difficulty;
    isPublic: boolean;
  }>;
  isDraft: boolean;
}) {
  const [addOpen, setAddOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<QuestionType>("SINGLE_CHOICE");
  const [, startRemoveTransition] = React.useTransition();

  function handleRemove(questionId: string) {
    if (!confirm("确定移除这道题吗？")) return;
    startRemoveTransition(async () => {
      await removeQuestionFromExamAction(examId, questionId);
    });
  }

  const totalScore = questions.reduce((s, q) => s + q.score, 0);

  // 按题型分组
  const byType = new Map<QuestionType, QuestionRow[]>();
  for (const q of questions) {
    const arr = byType.get(q.type) ?? [];
    arr.push(q);
    byType.set(q.type, arr);
  }
  const typeOrder: QuestionType[] = ["SINGLE_CHOICE", "FILL_BLANK", "CODE_BLANK", "PROGRAMMING"];

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">试卷题目</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="num">{questions.length}</span> 道题 · 总分{" "}
              <span className="num">{totalScore}</span>{" "}
              {!isDraft && "· 已发布，不可再修改"}
            </p>
          </div>
          {isDraft && (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus />
              添加题目
            </Button>
          )}
        </div>

        {questions.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-12 text-center text-sm text-muted-foreground">
            <ListChecks className="mx-auto h-8 w-8 text-subtle-foreground" />
            <p className="mt-3">还没有添加任何题目</p>
            {isDraft && (
              <p className="mt-1 text-xs text-subtle-foreground">
                点击右上角「添加题目」开始出卷
              </p>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {typeOrder
              .filter((t) => byType.has(t))
              .map((t) => {
                const arr = byType.get(t)!;
                return (
                  <div key={t}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {TYPE_LABEL[t]}
                      <span className="ml-2 num text-subtle-foreground">{arr.length}</span>
                    </p>
                    <ul className="space-y-2">
                      {arr.map((q, idx) => (
                        <QuestionRowItem
                          key={q.eqId}
                          index={idx + 1}
                          row={q}
                          isDraft={isDraft}
                          onRemove={() => handleRemove(q.questionId)}
                        />
                      ))}
                    </ul>
                  </div>
                );
              })}
          </div>
        )}

        {addOpen && (
          <AddQuestionDialog
            examId={examId}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onClose={() => setAddOpen(false)}
            availableProblems={availableProblems}
          />
        )}
      </CardContent>
    </Card>
  );
}

function QuestionRowItem({
  index,
  row,
  isDraft,
  onRemove,
}: {
  index: number;
  row: QuestionRow;
  isDraft: boolean;
  onRemove: () => void;
}) {
  return (
    <li className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start gap-3">
        <span className="num font-mono text-xs text-subtle-foreground">#{index}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant={DIFFICULTY_LABELS[row.difficulty].tone} className="font-normal">
              {DIFFICULTY_LABELS[row.difficulty].label}
            </Badge>
            <span className="num">{row.score} 分</span>
          </div>
          <div className="mt-2 whitespace-pre-line text-sm text-foreground">
            {row.content}
          </div>

          {/* Type-specific display */}
          {row.detail?.options && (
            <ul className="mt-2 space-y-1 text-sm">
              {row.detail.options.map((o) => (
                <li key={o.key} className="flex items-start gap-2 text-muted-foreground">
                  <span className="num font-mono text-xs font-semibold">{o.key}.</span>
                  <span>{o.text}</span>
                </li>
              ))}
            </ul>
          )}
          {row.type === "FILL_BLANK" && Array.isArray(row.detail?.answer) && (
            <div className="mt-2 text-xs text-muted-foreground">
              答案：
              {(row.detail.answer as string[]).map((a, i) => (
                <span key={i} className="num ml-1.5 rounded bg-muted px-1.5 py-0.5">
                  {a}
                </span>
              ))}
            </div>
          )}
          {row.type === "CODE_BLANK" && Array.isArray(row.detail?.answer) && (
            <div className="mt-2 text-xs text-muted-foreground">
              <span className="mr-1">填空答案：</span>
              {(row.detail.answer as string[]).map((a, i) => (
                <code
                  key={i}
                  className="num ml-1.5 inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-foreground"
                >
                  {`{{${i + 1}}}: ${a}`}
                </code>
              ))}
            </div>
          )}
          {row.type === "PROGRAMMING" && row.detail?.problemTitle && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Code className="h-3 w-3" />
              <span>引用编程题：{row.detail.problemTitle}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="num rounded-md border border-border bg-muted px-2.5 py-1 text-sm font-semibold text-foreground">
            {row.score}
          </div>
          {isDraft && (
            <button
              type="button"
              onClick={onRemove}
              className="rounded-md p-1.5 text-subtle-foreground transition-colors hover:bg-danger-subtle hover:text-danger"
              aria-label="移除"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

// ========== 添加题目对话框 ==========

function AddQuestionDialog({
  examId,
  activeTab,
  onTabChange,
  onClose,
  availableProblems,
}: {
  examId: string;
  activeTab: QuestionType;
  onTabChange: (t: QuestionType) => void;
  onClose: () => void;
  availableProblems: Array<{ id: string; title: string; difficulty: Difficulty; isPublic: boolean }>;
}) {
  const tabs: { key: QuestionType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "SINGLE_CHOICE", label: "单选", icon: ListChecks },
    { key: "FILL_BLANK", label: "填空", icon: Hash },
    { key: "CODE_BLANK", label: "代码填空", icon: FileCode },
    { key: "PROGRAMMING", label: "编程", icon: Code },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">添加题目</h3>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-1 border-b border-border">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = t.key === activeTab;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => onTabChange(t.key)}
                className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm transition-colors ${
                  active
                    ? "border-primary font-medium text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          {activeTab === "SINGLE_CHOICE" && (
            <SingleChoiceForm examId={examId} onAdded={onClose} />
          )}
          {activeTab === "FILL_BLANK" && (
            <FillBlankForm examId={examId} onAdded={onClose} />
          )}
          {activeTab === "CODE_BLANK" && (
            <CodeBlankForm examId={examId} onAdded={onClose} />
          )}
          {activeTab === "PROGRAMMING" && (
            <ProgrammingForm
              examId={examId}
              availableProblems={availableProblems}
              onAdded={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ----- 单选 -----
function SingleChoiceForm({ examId, onAdded }: { examId: string; onAdded: () => void }) {
  const [options, setOptions] = React.useState([
    { key: "A", text: "" },
    { key: "B", text: "" },
  ]);
  const [state, formAction, pending] = useActionState(
    async (prev: AddQuestionState | undefined, fd: FormData) =>
      addQuestionToExamAction(examId, prev, fd),
    undefined,
  );

  React.useEffect(() => {
    if (state?.ok) onAdded();
  }, [state, onAdded]);

  function addOption() {
    const nextKey = String.fromCharCode(65 + options.length);
    setOptions([...options, { key: nextKey, text: "" }]);
  }
  function removeOption(idx: number) {
    if (options.length <= 2) return;
    setOptions(options.filter((_, i) => i !== idx));
  }
  function updateOption(idx: number, text: string) {
    setOptions(options.map((o, i) => (i === idx ? { ...o, text } : o)));
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="type" value="SINGLE_CHOICE" />
      <input type="hidden" name="options" value={JSON.stringify(options)} />
      <input type="hidden" name="examId" value={examId} />
      <FormField label="题干" required error={state?.fieldErrors?.content}>
        <textarea
          name="content"
          required
          rows={3}
          placeholder="题目正文，可包含换行"
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus-visible:border-primary focus-visible:outline-none"
        />
      </FormField>
      <FormField label="选项">
        <div className="space-y-2">
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="num font-mono text-xs text-muted-foreground">{o.key}.</span>
              <input
                value={o.text}
                onChange={(e) => updateOption(i, e.target.value)}
                placeholder={`选项 ${o.key}`}
                className="flex-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm focus-visible:border-primary focus-visible:outline-none"
              />
              {options.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeOption(i)}
                  className="rounded-md p-1 text-subtle-foreground hover:bg-danger-subtle hover:text-danger"
                  aria-label="删除选项"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addOption}
            className="rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            + 添加选项
          </button>
        </div>
      </FormField>
      <div className="grid grid-cols-3 gap-3">
        <FormField label="正确答案" required error={state?.fieldErrors?.answer}>
          <select
            name="answer"
            required
            defaultValue=""
            className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:border-primary focus-visible:outline-none"
          >
            <option value="" disabled>
              选择
            </option>
            {options.map((o) => (
              <option key={o.key} value={o.key}>
                {o.key}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="难度" required>
          <select
            name="difficulty"
            defaultValue="EASY"
            className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:border-primary focus-visible:outline-none"
          >
            <option value="EASY">入门</option>
            <option value="MEDIUM">中等</option>
            <option value="HARD">进阶</option>
          </select>
        </FormField>
        <FormField label="分值" required error={state?.fieldErrors?.score}>
          <input
            name="score"
            type="number"
            required
            min={1}
            max={100}
            defaultValue={5}
            className="num h-9 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:border-primary focus-visible:outline-none"
          />
        </FormField>
      </div>
      <FormField label="解析（可选）" error={state?.fieldErrors?.explanation}>
        <input
          name="explanation"
          type="text"
          placeholder="向学生展示的简短解析"
          className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:border-primary focus-visible:outline-none"
        />
      </FormField>
      {state?.error && (
        <div className="rounded-lg border border-danger/30 bg-danger-subtle/40 px-3 py-2 text-xs text-danger">
          {state.error}
        </div>
      )}
      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Plus />}
          添加
        </Button>
      </div>
    </form>
  );
}

// ----- 填空 -----
function FillBlankForm({ examId, onAdded }: { examId: string; onAdded: () => void }) {
  const [count, setCount] = React.useState(1);
  const [state, formAction, pending] = useActionState(
    async (prev: AddQuestionState | undefined, fd: FormData) =>
      addQuestionToExamAction(examId, prev, fd),
    undefined,
  );
  const [answers, setAnswers] = React.useState<string[]>([""]);

  React.useEffect(() => {
    if (count > answers.length) {
      setAnswers([...answers, ...Array(count - answers.length).fill("")]);
    } else if (count < answers.length) {
      setAnswers(answers.slice(0, count));
    }
  }, [count]);

  React.useEffect(() => {
    if (state?.ok) onAdded();
  }, [state, onAdded]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="type" value="FILL_BLANK" />
      <input type="hidden" name="examId" value={examId} />
      <input type="hidden" name="answer" value={JSON.stringify(answers)} />
      <FormField
        label="题干"
        required
        error={state?.fieldErrors?.content}
        hint="用 {{1}} {{2}} 等标记空位"
      >
        <textarea
          name="content"
          required
          rows={3}
          placeholder="如：Python 中获取字符串长度的内置函数是 {{1}}"
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus-visible:border-primary focus-visible:outline-none"
        />
      </FormField>
      <FormField label="空位数" required>
        <input
          name="blankCount"
          type="number"
          min={1}
          max={10}
          value={count}
          onChange={(e) => setCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
          className="num h-9 w-24 rounded-md border border-border bg-card px-3 text-sm focus-visible:border-primary focus-visible:outline-none"
        />
      </FormField>
      <FormField
        label={`答案（${count} 个）`}
        required
        error={state?.fieldErrors?.answer}
      >
        <div className="space-y-2">
          {answers.map((a, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="num font-mono text-xs text-muted-foreground">
                {`{{${i + 1}}}`}
              </span>
              <input
                value={a}
                onChange={(e) => {
                  const next = [...answers];
                  next[i] = e.target.value;
                  setAnswers(next);
                }}
                placeholder={`第 ${i + 1} 空答案`}
                className="flex-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm focus-visible:border-primary focus-visible:outline-none"
              />
            </div>
          ))}
        </div>
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="难度">
          <select
            name="difficulty"
            defaultValue="EASY"
            className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:border-primary focus-visible:outline-none"
          >
            <option value="EASY">入门</option>
            <option value="MEDIUM">中等</option>
            <option value="HARD">进阶</option>
          </select>
        </FormField>
        <FormField label="分值" required error={state?.fieldErrors?.score}>
          <input
            name="score"
            type="number"
            required
            min={1}
            max={100}
            defaultValue={5}
            className="num h-9 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:border-primary focus-visible:outline-none"
          />
        </FormField>
      </div>
      <FormField label="解析（可选）">
        <input
          name="explanation"
          type="text"
          className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:border-primary focus-visible:outline-none"
        />
      </FormField>
      {state?.error && (
        <div className="rounded-lg border border-danger/30 bg-danger-subtle/40 px-3 py-2 text-xs text-danger">
          {state.error}
        </div>
      )}
      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Plus />}
          添加
        </Button>
      </div>
    </form>
  );
}

// ----- 代码填空 -----
function CodeBlankForm({ examId, onAdded }: { examId: string; onAdded: () => void }) {
  const [count, setCount] = React.useState(1);
  const [state, formAction, pending] = useActionState(
    async (prev: AddQuestionState | undefined, fd: FormData) =>
      addQuestionToExamAction(examId, prev, fd),
    undefined,
  );
  const [answers, setAnswers] = React.useState<string[]>([""]);

  React.useEffect(() => {
    if (count > answers.length) {
      setAnswers([...answers, ...Array(count - answers.length).fill("")]);
    } else if (count < answers.length) {
      setAnswers(answers.slice(0, count));
    }
  }, [count]);

  React.useEffect(() => {
    if (state?.ok) onAdded();
  }, [state, onAdded]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="type" value="CODE_BLANK" />
      <input type="hidden" name="examId" value={examId} />
      <input type="hidden" name="answer" value={JSON.stringify(answers)} />
      <FormField
        label="题干（含占位符）"
        required
        error={state?.fieldErrors?.content}
        hint="代码块里用 {{1}} {{2}} 标记空位"
      >
        <textarea
          name="content"
          required
          rows={6}
          placeholder="例：result = a {{1}} b"
          className="w-full rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-sm focus-visible:border-primary focus-visible:outline-none"
          style={{ tabSize: 4 }}
        />
      </FormField>
      <FormField label="空位数" required>
        <input
          name="blankCount"
          type="number"
          min={1}
          max={10}
          value={count}
          onChange={(e) => setCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
          className="num h-9 w-24 rounded-md border border-border bg-card px-3 text-sm focus-visible:border-primary focus-visible:outline-none"
        />
      </FormField>
      <FormField label={`答案（${count} 个）`} required error={state?.fieldErrors?.answer}>
        <div className="space-y-2">
          {answers.map((a, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="num font-mono text-xs text-muted-foreground">
                {`{{${i + 1}}}`}
              </span>
              <input
                value={a}
                onChange={(e) => {
                  const next = [...answers];
                  next[i] = e.target.value;
                  setAnswers(next);
                }}
                placeholder={`第 ${i + 1} 空答案`}
                className="flex-1 rounded-md border border-border bg-muted/40 px-3 py-1.5 font-mono text-sm focus-visible:border-primary focus-visible:outline-none"
              />
            </div>
          ))}
        </div>
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="难度">
          <select
            name="difficulty"
            defaultValue="EASY"
            className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:border-primary focus-visible:outline-none"
          >
            <option value="EASY">入门</option>
            <option value="MEDIUM">中等</option>
            <option value="HARD">进阶</option>
          </select>
        </FormField>
        <FormField label="分值" required error={state?.fieldErrors?.score}>
          <input
            name="score"
            type="number"
            required
            min={1}
            max={100}
            defaultValue={10}
            className="num h-9 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:border-primary focus-visible:outline-none"
          />
        </FormField>
      </div>
      <FormField label="解析（可选）">
        <input
          name="explanation"
          type="text"
          className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:border-primary focus-visible:outline-none"
        />
      </FormField>
      {state?.error && (
        <div className="rounded-lg border border-danger/30 bg-danger-subtle/40 px-3 py-2 text-xs text-danger">
          {state.error}
        </div>
      )}
      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Plus />}
          添加
        </Button>
      </div>
    </form>
  );
}

// ----- 编程题引用 -----
function ProgrammingForm({
  examId,
  availableProblems,
  onAdded,
}: {
  examId: string;
  availableProblems: Array<{ id: string; title: string; difficulty: Difficulty; isPublic: boolean }>;
  onAdded: () => void;
}) {
  const [search, setSearch] = React.useState("");
  const [picked, setPicked] = React.useState<string>("");
  const [state, formAction, pending] = useActionState(
    async (prev: AddQuestionState | undefined, fd: FormData) =>
      addQuestionToExamAction(examId, prev, fd),
    undefined,
  );

  React.useEffect(() => {
    if (state?.ok) onAdded();
  }, [state, onAdded]);

  const filtered = availableProblems.filter((p) =>
    !search ? true : p.title.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="type" value="PROGRAMMING" />
      <input type="hidden" name="examId" value={examId} />
      <input
        type="hidden"
        name="problemId"
        value={picked}
      />
      <FormField label="选择编程题" required error={state?.fieldErrors?.problemId}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="按题名筛选…"
          className="mb-2 h-9 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:border-primary focus-visible:outline-none"
        />
        <div className="max-h-60 overflow-y-auto rounded-md border border-border">
          {filtered.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">
              {availableProblems.length === 0
                ? "无可用编程题（需本人创建或公开）"
                : "没有匹配的编程题"}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((p) => (
                <li
                  key={p.id}
                  className={`cursor-pointer px-4 py-2 text-sm transition-colors hover:bg-muted/40 ${
                    picked === p.id ? "bg-primary-subtle" : ""
                  }`}
                  onClick={() => setPicked(p.id)}
                >
                  <div className="flex items-center gap-2">
                    <Badge variant={DIFFICULTY_LABELS[p.difficulty].tone} className="font-normal">
                      {DIFFICULTY_LABELS[p.difficulty].label}
                    </Badge>
                    <span className="font-medium text-foreground">{p.title}</span>
                    {p.isPublic ? (
                      <Badge variant="default" className="font-normal">公开库</Badge>
                    ) : (
                      <Badge variant="primary" className="font-normal">我的</Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </FormField>
      <FormField label="分值" required error={state?.fieldErrors?.score}>
        <input
          name="score"
          type="number"
          required
          min={1}
          max={100}
          defaultValue={20}
          className="num h-9 w-24 rounded-md border border-border bg-card px-3 text-sm focus-visible:border-primary focus-visible:outline-none"
        />
      </FormField>
      {state?.error && (
        <div className="rounded-lg border border-danger/30 bg-danger-subtle/40 px-3 py-2 text-xs text-danger">
          {state.error}
        </div>
      )}
      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button type="submit" size="sm" disabled={pending || !picked}>
          {pending ? <Loader2 className="animate-spin" /> : <Plus />}
          添加
        </Button>
      </div>
    </form>
  );
}

function FormField({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-[11px] text-subtle-foreground">{hint}</p>}
      {error && <p className="mt-1 text-[11px] text-danger">{error}</p>}
    </div>
  );
}
