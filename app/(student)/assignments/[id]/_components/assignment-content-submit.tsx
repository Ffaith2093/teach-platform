"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileUp, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { submitAssignmentContentAction, type SubmitAssignmentContentState } from "@/app/(student)/assignments/actions";

type Question = {
  id: string;
  content: string;
  type: "SINGLE_CHOICE" | "FILL_BLANK" | "CODE_BLANK" | "PROGRAMMING";
  options: Array<{ key: string; text: string }>;
  blankCount: number;
  score: number;
};

const initial: SubmitAssignmentContentState = {};

export function AssignmentContentSubmit({
  assignmentId,
  questions,
  allowAttachment,
  allowedExtensions,
  maxFileSizeMb,
  initialAnswers,
  existingFileName,
}: {
  assignmentId: string;
  questions: Question[];
  allowAttachment: boolean;
  allowedExtensions: string[];
  maxFileSizeMb: number;
  initialAnswers: Record<string, unknown>;
  existingFileName: string | null;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(submitAssignmentContentAction, initial);
  const [answers, setAnswers] = React.useState<Record<string, unknown>>(initialAnswers);

  React.useEffect(() => {
    if (state.ok) router.refresh();
  }, [router, state.ok]);

  function setBlank(questionId: string, index: number, value: string) {
    const current = Array.isArray(answers[questionId]) ? [...(answers[questionId] as unknown[])] : [];
    current[index] = value;
    setAnswers((previous) => ({ ...previous, [questionId]: current }));
  }

  return (
    <form action={action} className="space-y-6 rounded-xl border border-border bg-card p-6">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <input type="hidden" name="answers" value={JSON.stringify(answers)} />

      {questions.length > 0 && <section className="space-y-5"><h2 className="flex items-center gap-2 text-base font-semibold"><ListChecks className="h-4 w-4 text-primary" />选择题与填空题</h2>{questions.map((question, index) => <div key={question.id} className="space-y-2 border-t border-border pt-4 first:border-0 first:pt-0"><div className="flex items-start justify-between gap-3"><p className="text-sm font-medium"><span className="mr-2 text-muted-foreground num">{index + 1}.</span>{question.content}</p><span className="shrink-0 text-xs text-muted-foreground num">{question.score} 分</span></div>{question.type === "SINGLE_CHOICE" ? <div className="grid gap-2 sm:grid-cols-2">{question.options.map((option) => <label key={option.key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted/40"><input type="radio" name={`question-${question.id}`} checked={answers[question.id] === option.key} onChange={() => setAnswers((previous) => ({ ...previous, [question.id]: option.key }))} /><b>{option.key}</b><span>{option.text}</span></label>)}</div> : <div className="space-y-2">{Array.from({ length: question.blankCount }, (_, blankIndex) => <input key={blankIndex} value={Array.isArray(answers[question.id]) ? String((answers[question.id] as unknown[])[blankIndex] ?? "") : ""} onChange={(event) => setBlank(question.id, blankIndex, event.target.value)} placeholder={`第 ${blankIndex + 1} 个空`} className="flex h-9 w-full rounded-lg border border-border bg-muted px-3 text-sm focus-visible:border-primary focus-visible:outline-none" />)}</div>}</div>)}</section>}

      {allowAttachment && <section className="space-y-2 border-t border-border pt-5"><Label htmlFor="assignment-attachment" className="flex items-center gap-2 text-base"><FileUp className="h-4 w-4 text-primary" />附件提交</Label><input id="assignment-attachment" name="attachment" type="file" required={!existingFileName} accept={allowedExtensions.map((extension) => `.${extension}`).join(",")} className="block w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm file:mr-3 file:border-0 file:bg-transparent file:font-medium" /><p className="text-xs text-muted-foreground">支持 {allowedExtensions.map((extension) => `.${extension}`).join("、")}，不超过 {maxFileSizeMb}MB{existingFileName ? `；当前文件：${existingFileName}，不选择新文件将保留原文件` : ""}</p></section>}

      {state.error && <p className="rounded-lg border border-danger/30 bg-danger-subtle/40 px-3 py-2 text-xs text-danger">{state.error}</p>}
      {state.ok && <p className="flex items-center gap-2 text-sm text-success"><CheckCircle2 className="h-4 w-4" />提交成功</p>}
      <div className="flex justify-end"><Button type="submit" disabled={pending}>{pending ? "提交中…" : existingFileName || Object.keys(initialAnswers).length > 0 ? "更新提交" : "提交作业内容"}</Button></div>
    </form>
  );
}
