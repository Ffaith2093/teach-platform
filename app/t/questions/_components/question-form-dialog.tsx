"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { X, ListChecks, Hash, FileCode, Code, Loader2, Plus, Save } from "lucide-react";
import {
  SingleChoiceFields,
  FillBlankFields,
  CodeBlankFields,
  ProgrammingFields,
  TYPE_LABEL,
} from "./forms";
import type { Difficulty, QuestionType } from "@prisma/client";

export type QuestionFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
};

export type QuestionFormDialogProps = {
  mode: "add" | "edit";
  initialType?: QuestionType;
  /** 固定题型时隐藏题型切换（用于选择题/填空题公共库的新建入口）。 */
  fixedType?: QuestionType;
  /** 表单提交（父级 useActionState 暴露的 formAction） */
  formAction: (payload: FormData) => void;
  /** 父级 useActionState 的 pending 状态 */
  pending?: boolean;
  /** 父级 useActionState 的 state */
  state?: QuestionFormState | null;
  /** 默认值（edit 模式） */
  defaultValue?: {
    questionId?: string;
    type: QuestionType;
    content?: string;
    options?: { key: string; text: string }[];
    answer?: string | string[];
    score?: number;
    difficulty?: Difficulty;
    explanation?: string;
    problemId?: string;
  };
  /** 仅编程题需要 */
  availableProblems?: Array<{
    id: string;
    title: string;
    difficulty: Difficulty;
    isPublic: boolean;
  }>;
  bankOptions?: Array<{ id: string; name: string }>;
  onClose: () => void;
};

const TYPE_TABS: {
  key: QuestionType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: "SINGLE_CHOICE", label: "单选", icon: ListChecks },
  { key: "FILL_BLANK", label: "填空", icon: Hash },
  { key: "CODE_BLANK", label: "代码填空", icon: FileCode },
  { key: "PROGRAMMING", label: "编程", icon: Code },
];

export function QuestionFormDialog({
  mode,
  initialType,
  fixedType,
  formAction,
  pending = false,
  state = null,
  defaultValue,
  availableProblems = [],
  bankOptions,
  onClose,
}: QuestionFormDialogProps) {
  const startType = fixedType ?? initialType ?? defaultValue?.type ?? "SINGLE_CHOICE";
  const [activeTab, setActiveTab] = React.useState<QuestionType>(startType);
  const fieldErrors = state?.fieldErrors;

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
          <h3 className="text-base font-semibold">{mode === "add" ? "添加题目" : "编辑题目"}</h3>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {mode === "add" && !fixedType && (
          <div className="mt-4 flex items-center gap-1 border-b border-border">
            {TYPE_TABS.map((t) => {
              const Icon = t.icon;
              const active = t.key === activeTab;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveTab(t.key)}
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
        )}

        <form action={formAction} className="mt-4 space-y-3">
          <input type="hidden" name="type" value={activeTab} />
          {mode === "edit" && defaultValue?.questionId && (
            <input type="hidden" name="questionId" value={defaultValue.questionId} />
          )}

          {bankOptions && (
            <div className="space-y-1.5">
              <label htmlFor="question-bank" className="text-xs font-medium text-foreground">
                保存到题库 <span className="text-danger">*</span>
              </label>
              <select
                id="question-bank"
                name="bankId"
                required
                defaultValue=""
                className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:border-primary focus-visible:outline-none"
              >
                <option value="" disabled>
                  请选择题库
                </option>
                {bankOptions.map((bank) => (
                  <option key={bank.id} value={bank.id}>
                    {bank.name}
                  </option>
                ))}
              </select>
              {fieldErrors?.bankId && <p className="text-xs text-danger">{fieldErrors.bankId}</p>}
            </div>
          )}

          {activeTab === "SINGLE_CHOICE" && (
            <SingleChoiceFields
              defaultValue={
                mode === "edit" && defaultValue?.type === "SINGLE_CHOICE"
                  ? {
                      content: defaultValue.content,
                      options: defaultValue.options,
                      answer:
                        typeof defaultValue.answer === "string" ? defaultValue.answer : undefined,
                      score: defaultValue.score,
                      difficulty: defaultValue.difficulty,
                      explanation: defaultValue.explanation,
                    }
                  : undefined
              }
              fieldErrors={fieldErrors}
            />
          )}
          {activeTab === "FILL_BLANK" && (
            <FillBlankFields
              defaultValue={
                mode === "edit" && defaultValue?.type === "FILL_BLANK"
                  ? {
                      content: defaultValue.content,
                      answer: Array.isArray(defaultValue.answer) ? defaultValue.answer : undefined,
                      score: defaultValue.score,
                      difficulty: defaultValue.difficulty,
                      explanation: defaultValue.explanation,
                    }
                  : undefined
              }
              fieldErrors={fieldErrors}
            />
          )}
          {activeTab === "CODE_BLANK" && (
            <CodeBlankFields
              defaultValue={
                mode === "edit" && defaultValue?.type === "CODE_BLANK"
                  ? {
                      content: defaultValue.content,
                      answer: Array.isArray(defaultValue.answer) ? defaultValue.answer : undefined,
                      score: defaultValue.score,
                      difficulty: defaultValue.difficulty,
                      explanation: defaultValue.explanation,
                    }
                  : undefined
              }
              fieldErrors={fieldErrors}
            />
          )}
          {activeTab === "PROGRAMMING" && (
            <ProgrammingFields
              availableProblems={availableProblems}
              defaultValue={
                mode === "edit" && defaultValue?.type === "PROGRAMMING"
                  ? { problemId: defaultValue.problemId, score: defaultValue.score }
                  : undefined
              }
              fieldErrors={fieldErrors}
            />
          )}

          {state?.error && (
            <div className="rounded-lg border border-danger/30 bg-danger-subtle/40 px-3 py-2 text-xs text-danger">
              {state.error}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            <span className="text-xs text-muted-foreground">题型：{TYPE_LABEL[activeTab]}</span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                取消
              </Button>
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : mode === "add" ? (
                  <Plus className="h-3.5 w-3.5" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {mode === "add" ? "添加" : "保存"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
