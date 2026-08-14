"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Code } from "lucide-react";
import { FormField } from "./form-field";
import type { Difficulty, QuestionType } from "@prisma/client";

// ========== 公共：题型描述 ==========

export const DIFFICULTY_LABELS: Record<Difficulty, { label: string; tone: "success" | "warning" | "danger" }> = {
  EASY: { label: "入门", tone: "success" },
  MEDIUM: { label: "中等", tone: "warning" },
  HARD: { label: "进阶", tone: "danger" },
};

export const TYPE_LABEL: Record<QuestionType, string> = {
  SINGLE_CHOICE: "单选",
  FILL_BLANK: "填空",
  CODE_BLANK: "代码填空",
  PROGRAMMING: "编程",
};

// ========== 单选 ==========

export function SingleChoiceFields({
  defaultValue,
  fieldErrors,
}: {
  defaultValue?: {
    content?: string;
    options?: { key: string; text: string }[];
    answer?: string;
    score?: number;
    difficulty?: Difficulty;
    explanation?: string;
  };
  fieldErrors?: Record<string, string>;
}) {
  const [options, setOptions] = React.useState(
    defaultValue?.options && defaultValue.options.length >= 2
      ? defaultValue.options
      : defaultValue?.options && defaultValue.options.length >= 1
        ? [defaultValue.options[0], { key: "B", text: "" }]
        : [{ key: "A", text: "" }, { key: "B", text: "" }],
  );

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
    <div className="space-y-3">
      <input type="hidden" name="options" value={JSON.stringify(options)} />
      <FormField label="题干" required error={fieldErrors?.content}>
        <textarea
          name="content"
          required
          rows={3}
          defaultValue={defaultValue?.content ?? ""}
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
                  ×
                </button>
              )}
            </div>
          ))}
          {options.length < 8 && (
            <button
              type="button"
              onClick={addOption}
              className="rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              + 添加选项
            </button>
          )}
        </div>
      </FormField>
      <div className="grid grid-cols-3 gap-3">
        <FormField label="正确答案" required error={fieldErrors?.answer}>
          <select
            name="answer"
            required
            defaultValue={defaultValue?.answer ?? ""}
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
        <FormField label="难度">
          <select
            name="difficulty"
            defaultValue={defaultValue?.difficulty ?? "EASY"}
            className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:border-primary focus-visible:outline-none"
          >
            <option value="EASY">入门</option>
            <option value="MEDIUM">中等</option>
            <option value="HARD">进阶</option>
          </select>
        </FormField>
        <FormField label="分值" required error={fieldErrors?.score}>
          <input
            name="score"
            type="number"
            required
            min={1}
            max={100}
            defaultValue={defaultValue?.score ?? 5}
            className="num h-9 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:border-primary focus-visible:outline-none"
          />
        </FormField>
      </div>
      <FormField label="解析（可选）" error={fieldErrors?.explanation}>
        <input
          name="explanation"
          type="text"
          defaultValue={defaultValue?.explanation ?? ""}
          placeholder="向学生展示的简短解析"
          className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:border-primary focus-visible:outline-none"
        />
      </FormField>
    </div>
  );
}

// ========== 填空 ==========

export function FillBlankFields({
  defaultValue,
  fieldErrors,
}: {
  defaultValue?: {
    content?: string;
    answer?: string[];
    score?: number;
    difficulty?: Difficulty;
    explanation?: string;
  };
  fieldErrors?: Record<string, string>;
}) {
  const initialCount = defaultValue?.answer?.length ?? defaultValue?.content?.match(/\{\{\s*\d+\s*\}\}/g)?.length ?? 1;
  const [count, setCount] = React.useState(Math.max(1, Math.min(10, initialCount)));
  const [answers, setAnswers] = React.useState<string[]>(() => {
    const target = Math.max(1, Math.min(10, initialCount));
    const seed = defaultValue?.answer ?? [];
    return Array.from({ length: target }, (_, i) => seed[i] ?? "");
  });

  React.useEffect(() => {
    if (count > answers.length) {
      setAnswers([...answers, ...Array(count - answers.length).fill("")]);
    } else if (count < answers.length) {
      setAnswers(answers.slice(0, count));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  return (
    <div className="space-y-3">
      <input type="hidden" name="answer" value={JSON.stringify(answers)} />
      <FormField
        label="题干"
        required
        error={fieldErrors?.content}
        hint="用 {{1}} {{2}} 等标记空位"
      >
        <textarea
          name="content"
          required
          rows={3}
          defaultValue={defaultValue?.content ?? ""}
          placeholder="如：Python 中获取字符串长度的内置函数是 {{1}}"
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus-visible:border-primary focus-visible:outline-none"
        />
      </FormField>
      <FormField label="空位数" required>
        <input
          type="number"
          min={1}
          max={10}
          value={count}
          onChange={(e) => setCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
          className="num h-9 w-24 rounded-md border border-border bg-card px-3 text-sm focus-visible:border-primary focus-visible:outline-none"
        />
      </FormField>
      <FormField label={`答案（${count} 个）`} required error={fieldErrors?.answer}>
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
            defaultValue={defaultValue?.difficulty ?? "EASY"}
            className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:border-primary focus-visible:outline-none"
          >
            <option value="EASY">入门</option>
            <option value="MEDIUM">中等</option>
            <option value="HARD">进阶</option>
          </select>
        </FormField>
        <FormField label="分值" required error={fieldErrors?.score}>
          <input
            name="score"
            type="number"
            required
            min={1}
            max={100}
            defaultValue={defaultValue?.score ?? 5}
            className="num h-9 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:border-primary focus-visible:outline-none"
          />
        </FormField>
      </div>
      <FormField label="解析（可选）" error={fieldErrors?.explanation}>
        <input
          name="explanation"
          type="text"
          defaultValue={defaultValue?.explanation ?? ""}
          className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:border-primary focus-visible:outline-none"
        />
      </FormField>
    </div>
  );
}

// ========== 代码填空 ==========

export function CodeBlankFields({
  defaultValue,
  fieldErrors,
}: {
  defaultValue?: {
    content?: string;
    answer?: string[];
    score?: number;
    difficulty?: Difficulty;
    explanation?: string;
  };
  fieldErrors?: Record<string, string>;
}) {
  const initialCount = defaultValue?.answer?.length ?? defaultValue?.content?.match(/\{\{\s*\d+\s*\}\}/g)?.length ?? 1;
  const [count, setCount] = React.useState(Math.max(1, Math.min(10, initialCount)));
  const [answers, setAnswers] = React.useState<string[]>(() => {
    const target = Math.max(1, Math.min(10, initialCount));
    const seed = defaultValue?.answer ?? [];
    return Array.from({ length: target }, (_, i) => seed[i] ?? "");
  });

  React.useEffect(() => {
    if (count > answers.length) {
      setAnswers([...answers, ...Array(count - answers.length).fill("")]);
    } else if (count < answers.length) {
      setAnswers(answers.slice(0, count));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  return (
    <div className="space-y-3">
      <input type="hidden" name="answer" value={JSON.stringify(answers)} />
      <FormField
        label="题干（含占位符）"
        required
        error={fieldErrors?.content}
        hint="代码块里用 {{1}} {{2}} 标记空位"
      >
        <textarea
          name="content"
          required
          rows={6}
          defaultValue={defaultValue?.content ?? ""}
          placeholder="例：result = a {{1}} b"
          className="w-full rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-sm focus-visible:border-primary focus-visible:outline-none"
          style={{ tabSize: 4 }}
        />
      </FormField>
      <FormField label="空位数" required>
        <input
          type="number"
          min={1}
          max={10}
          value={count}
          onChange={(e) => setCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
          className="num h-9 w-24 rounded-md border border-border bg-card px-3 text-sm focus-visible:border-primary focus-visible:outline-none"
        />
      </FormField>
      <FormField label={`答案（${count} 个）`} required error={fieldErrors?.answer}>
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
            defaultValue={defaultValue?.difficulty ?? "EASY"}
            className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:border-primary focus-visible:outline-none"
          >
            <option value="EASY">入门</option>
            <option value="MEDIUM">中等</option>
            <option value="HARD">进阶</option>
          </select>
        </FormField>
        <FormField label="分值" required error={fieldErrors?.score}>
          <input
            name="score"
            type="number"
            required
            min={1}
            max={100}
            defaultValue={defaultValue?.score ?? 10}
            className="num h-9 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:border-primary focus-visible:outline-none"
          />
        </FormField>
      </div>
      <FormField label="解析（可选）" error={fieldErrors?.explanation}>
        <input
          name="explanation"
          type="text"
          defaultValue={defaultValue?.explanation ?? ""}
          className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:border-primary focus-visible:outline-none"
        />
      </FormField>
    </div>
  );
}

// ========== 编程 ==========

export function ProgrammingFields({
  availableProblems,
  defaultValue,
  fieldErrors,
}: {
  availableProblems: Array<{ id: string; title: string; difficulty: Difficulty; isPublic: boolean }>;
  defaultValue?: { problemId?: string; score?: number };
  fieldErrors?: Record<string, string>;
}) {
  const [search, setSearch] = React.useState("");
  const [picked, setPicked] = React.useState<string>(defaultValue?.problemId ?? "");

  const filtered = availableProblems.filter((p) =>
    !search ? true : p.title.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-3">
      <input type="hidden" name="problemId" value={picked} />
      <FormField label="选择编程题" required error={fieldErrors?.problemId}>
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
      <FormField label="分值" required error={fieldErrors?.score}>
        <input
          name="score"
          type="number"
          required
          min={1}
          max={100}
          defaultValue={defaultValue?.score ?? 20}
          className="num h-9 w-24 rounded-md border border-border bg-card px-3 text-sm focus-visible:border-primary focus-visible:outline-none"
        />
      </FormField>
      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        <Code className="mt-0.5 h-3.5 w-3.5" />
        <span>
          编程题的分值与难度从 Problem 继承；这里只设置「本卷引用时」的分值。
        </span>
      </div>
    </div>
  );
}