"use client";

import * as React from "react";
import { useActionState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSurveyAction, type CreateSurveyState } from "@/app/t/surveys/actions";

type SurveyQuestionType = "SHORT_TEXT" | "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "DROPDOWN";
type DraftQuestion = { key: string; type: SurveyQuestionType; title: string; required: boolean; options: string[] };
type CourseOption = { id: string; title: string; chapters: Array<{ id: string; title: string; order: number }> };

const TYPE_LABEL: Record<SurveyQuestionType, string> = {
  SHORT_TEXT: "填空",
  SINGLE_CHOICE: "单选",
  MULTIPLE_CHOICE: "多选",
  DROPDOWN: "下拉框",
};

const initialState: CreateSurveyState = {};

function newQuestion(index: number): DraftQuestion {
  return { key: `${Date.now()}-${index}`, type: "SHORT_TEXT", title: "", required: true, options: ["选项 1", "选项 2"] };
}

export function SurveyBuilder({ courses, initialCourseId, initialChapterId }: { courses: CourseOption[]; initialCourseId?: string; initialChapterId?: string }) {
  const [state, action, pending] = useActionState(createSurveyAction, initialState);
  const initialCourse = courses.find((course) => course.id === initialCourseId) ?? courses[0];
  const [courseId, setCourseId] = React.useState(initialCourse?.id ?? "");
  const [chapterId, setChapterId] = React.useState(
    initialCourse?.chapters.some((chapter) => chapter.id === initialChapterId)
      ? initialChapterId ?? ""
      : initialCourse?.chapters[0]?.id ?? "",
  );
  const [questions, setQuestions] = React.useState<DraftQuestion[]>([newQuestion(0)]);
  const chapters = courses.find((course) => course.id === courseId)?.chapters ?? [];

  function updateQuestion(key: string, patch: Partial<DraftQuestion>) {
    setQuestions((current) => current.map((question) => question.key === key ? { ...question, ...patch } : question));
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    setQuestions((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="chapterId" value={chapterId} />
      <input type="hidden" name="questions" value={JSON.stringify(questions.map(({ key: _key, ...question }) => question))} />

      <section className="grid gap-4 rounded-lg border border-border bg-card p-6 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="survey-title">问卷标题</Label>
          <Input id="survey-title" name="title" required maxLength={100} />
          {state.fieldErrors?.title && <p className="text-xs text-danger">{state.fieldErrors.title}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="survey-course">课程</Label>
          <select id="survey-course" value={courseId} onChange={(event) => {
            const nextCourse = courses.find((course) => course.id === event.target.value);
            setCourseId(event.target.value);
            setChapterId(nextCourse?.chapters[0]?.id ?? "");
          }} className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm outline-none focus:border-primary">
            {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="survey-chapter">章节</Label>
          <select id="survey-chapter" value={chapterId} onChange={(event) => setChapterId(event.target.value)} required className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm outline-none focus:border-primary">
            <option value="" disabled>请选择章节</option>
            {chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>第 {chapter.order} 章 · {chapter.title}</option>)}
          </select>
          {state.fieldErrors?.chapterId && <p className="text-xs text-danger">{state.fieldErrors.chapterId}</p>}
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="survey-description">说明（可选）</Label>
          <textarea id="survey-description" name="description" rows={3} maxLength={2000} className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="survey-due">截止时间（可选）</Label>
          <Input id="survey-due" name="dueAt" type="datetime-local" />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">问卷题目</h2>
          <Button type="button" variant="outline" onClick={() => setQuestions((current) => [...current, newQuestion(current.length)])}>
            <Plus className="h-4 w-4" />添加题目
          </Button>
        </div>
        {questions.map((question, index) => {
          const choiceType = question.type !== "SHORT_TEXT";
          return (
            <div key={question.key} className="space-y-4 rounded-lg border border-border bg-card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="num text-sm font-semibold text-primary">{index + 1}</span>
                <select value={question.type} onChange={(event) => updateQuestion(question.key, { type: event.target.value as SurveyQuestionType })} className="h-9 rounded-md border border-border bg-card px-3 text-sm outline-none focus:border-primary">
                  {Object.entries(TYPE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <label className="ml-2 flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={question.required} onChange={(event) => updateQuestion(question.key, { required: event.target.checked })} />必填</label>
                <div className="ml-auto flex items-center gap-1">
                  <Button type="button" size="icon" variant="ghost" aria-label="上移" disabled={index === 0} onClick={() => moveQuestion(index, -1)}><ArrowUp className="h-4 w-4" /></Button>
                  <Button type="button" size="icon" variant="ghost" aria-label="下移" disabled={index === questions.length - 1} onClick={() => moveQuestion(index, 1)}><ArrowDown className="h-4 w-4" /></Button>
                  <Button type="button" size="icon" variant="ghost" aria-label="删除题目" disabled={questions.length === 1} onClick={() => setQuestions((current) => current.filter((item) => item.key !== question.key))}><Trash2 className="h-4 w-4 text-danger" /></Button>
                </div>
              </div>
              <Input value={question.title} onChange={(event) => updateQuestion(question.key, { title: event.target.value })} placeholder="请输入问题" maxLength={500} />
              {choiceType && (
                <div className="space-y-2 pl-6">
                  {question.options.map((option, optionIndex) => (
                    <div key={optionIndex} className="flex items-center gap-2">
                      <span className="num w-5 text-xs text-muted-foreground">{optionIndex + 1}</span>
                      <Input value={option} onChange={(event) => updateQuestion(question.key, { options: question.options.map((item, i) => i === optionIndex ? event.target.value : item) })} maxLength={200} />
                      <Button type="button" size="icon" variant="ghost" aria-label="删除选项" disabled={question.options.length <= 2} onClick={() => updateQuestion(question.key, { options: question.options.filter((_, i) => i !== optionIndex) })}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                  <Button type="button" size="sm" variant="ghost" onClick={() => updateQuestion(question.key, { options: [...question.options, `选项 ${question.options.length + 1}`] })}><Plus className="h-3.5 w-3.5" />添加选项</Button>
                </div>
              )}
            </div>
          );
        })}
        {state.fieldErrors?.questions && <p className="text-xs text-danger">{state.fieldErrors.questions}</p>}
      </section>

      {state.error && <div className="rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger">{state.error}</div>}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="submit" name="intent" value="draft" variant="outline" disabled={pending}>保存草稿</Button>
        <Button type="submit" name="intent" value="publish" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}发布问卷</Button>
      </div>
    </form>
  );
}
