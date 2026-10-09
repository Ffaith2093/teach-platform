"use client";

import * as React from "react";
import { useActionState } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { submitSurveyResponseAction, type SubmitSurveyState } from "../actions";

type Question = {
  id: string;
  type: "SHORT_TEXT" | "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "DROPDOWN";
  title: string;
  required: boolean;
  options: string[];
  order: number;
};

const initialState: SubmitSurveyState = {};

export function SurveyResponseForm({ surveyId, questions, initialAnswers, canSubmit }: { surveyId: string; questions: Question[]; initialAnswers: Record<string, unknown>; canSubmit: boolean }) {
  const [state, action, pending] = useActionState(submitSurveyResponseAction, initialState);
  const [answers, setAnswers] = React.useState<Record<string, unknown>>(initialAnswers);

  function setAnswer(questionId: string, value: unknown) {
    setAnswers((current) => ({ ...current, [questionId]: value }));
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="surveyId" value={surveyId} />
      <input type="hidden" name="answers" value={JSON.stringify(answers)} />
      {questions.map((question, index) => (
        <section key={question.id} className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-start gap-2"><span className="num text-sm font-semibold text-primary">{index + 1}.</span><h2 className="text-base font-medium">{question.title}{question.required && <span className="ml-1 text-danger">*</span>}</h2></div>
          <div className="mt-4 pl-6">
            {question.type === "SHORT_TEXT" && <textarea value={String(answers[question.id] ?? "")} onChange={(event) => setAnswer(question.id, event.target.value)} disabled={!canSubmit} required={question.required} rows={4} maxLength={5000} className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary disabled:bg-muted" />}
            {question.type === "SINGLE_CHOICE" && <div className="space-y-2">{question.options.map((option) => <label key={option} className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2.5 text-sm hover:bg-muted/40"><input type="radio" name={`survey-${question.id}`} checked={answers[question.id] === option} onChange={() => setAnswer(question.id, option)} disabled={!canSubmit} required={question.required} />{option}</label>)}</div>}
            {question.type === "MULTIPLE_CHOICE" && <div className="space-y-2">{question.options.map((option) => { const selected = Array.isArray(answers[question.id]) && (answers[question.id] as unknown[]).includes(option); return <label key={option} className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2.5 text-sm hover:bg-muted/40"><input type="checkbox" checked={selected} onChange={(event) => { const current = Array.isArray(answers[question.id]) ? answers[question.id] as string[] : []; setAnswer(question.id, event.target.checked ? [...current, option] : current.filter((item) => item !== option)); }} disabled={!canSubmit} />{option}</label>; })}</div>}
            {question.type === "DROPDOWN" && <select value={String(answers[question.id] ?? "")} onChange={(event) => setAnswer(question.id, event.target.value)} disabled={!canSubmit} required={question.required} className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm outline-none focus:border-primary disabled:bg-muted"><option value="">请选择</option>{question.options.map((option) => <option key={option} value={option}>{option}</option>)}</select>}
          </div>
        </section>
      ))}
      {state.error && <div className="rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger">{state.error}</div>}
      {state.ok && <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success-subtle px-3 py-2 text-sm text-success"><CheckCircle2 className="h-4 w-4" />回答已保存</div>}
      {canSubmit && <div className="flex justify-end"><Button type="submit" disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{initialAnswers && Object.keys(initialAnswers).length > 0 ? "更新回答" : "提交问卷"}</Button></div>}
    </form>
  );
}
