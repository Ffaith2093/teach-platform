"use client";

import * as React from "react";
import { useActionState } from "react";
import { Check, ChevronRight, ChevronLeft, BookOpen, Users, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { createCourseAction, type CreateCourseState } from "@/app/t/courses/actions";

interface ClassOption {
  id: string;
  name: string;
  gradeName: string;
  gradeJoinYear: number;
  studentCount: number;
}

interface CollaboratorOption {
  id: string;
  name: string;
  teacherNo: string | null;
  subjects: string[];
}

const STEPS = [
  { key: "info", label: "基本信息", icon: BookOpen },
  { key: "classes", label: "授课班级", icon: Users },
  { key: "collabs", label: "协作者", icon: UserPlus },
] as const;

const initial: CreateCourseState = {};

export function CreateCourseForm({
  classes,
  collaborators,
}: {
  classes: ClassOption[];
  collaborators: CollaboratorOption[];
}) {
  const [state, formAction, pending] = useActionState(createCourseAction, initial);
  const [step, setStep] = React.useState(0);
  const [selectedClasses, setSelectedClasses] = React.useState<Set<string>>(new Set());
  const [selectedCollabs, setSelectedCollabs] = React.useState<Set<string>>(new Set());

  const canNext = step === 0 ? true : step === 1 ? selectedClasses.size > 0 : true;

  function toggleClass(id: string) {
    setSelectedClasses((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleCollab(id: string) {
    setSelectedCollabs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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

      <form action={formAction} className="p-6">
        {/* 三步全部常驻 DOM（hidden 控制显示），保留 typed values */}
        <div className="space-y-4" hidden={step !== 0}>
          {/* 步骤 1：基本信息 */}
            <div className="space-y-1.5">
              <Label htmlFor="course-title">课程标题</Label>
              <Input
                id="course-title"
                name="title"
                placeholder="Python 程序设计 · 高一"
                required
              />
              {state.fieldErrors?.title && (
                <p className="text-xs text-danger">{state.fieldErrors.title}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="course-desc">课程描述（可选）</Label>
              <Input
                id="course-desc"
                name="description"
                placeholder="面向高一年级的 Python 入门课程…"
                maxLength={500}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="course-category">分类</Label>
                <select
                  id="course-category"
                  name="category"
                  defaultValue="ALGORITHM"
                  className="flex h-9 w-full rounded-lg border border-border bg-muted px-3 text-sm focus-visible:border-primary focus-visible:bg-card focus-visible:outline-none"
                  required
                >
                  <option value="DATA">数据</option>
                  <option value="ALGORITHM">算法</option>
                  <option value="AI">人工智能</option>
                  <option value="NETWORK">计算机网络</option>
                  <option value="INTERDISCIPLINARY">多学科交叉</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="course-semester">学期</Label>
                <Input
                  id="course-semester"
                  name="semester"
                  defaultValue={`${new Date().getFullYear()}-${new Date().getFullYear() + 1} 学年 上学期`}
                  required
                />
              </div>
            </div>
          </div>

        {/* 步骤 2：授课班级 */}
        <div className="space-y-3" hidden={step !== 1}>
            <p className="text-sm text-muted-foreground">
              勾选您要授课的班级（必须由您任教）。所选班级学生将自动成为课程成员。
            </p>
            {classes.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-8 text-center text-sm text-muted-foreground">
                您尚未被分配任何授课班级，请联系管理员。
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {classes.map((c) => {
                  const checked = selectedClasses.has(c.id);
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
                        type="checkbox"
                        name="classIds"
                        value={c.id}
                        checked={checked}
                        onChange={() => toggleClass(c.id)}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-foreground">{c.name}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Badge variant="primary">{c.gradeName}</Badge>
                          <span className="num">{c.gradeJoinYear} 级</span>
                          <span>·</span>
                          <span className="num">{c.studentCount} 学生</span>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
            {state.fieldErrors?.classIds && (
              <p className="text-xs text-danger">{state.fieldErrors.classIds}</p>
            )}
          </div>

        {/* 步骤 3：协作者 */}
        <div className="space-y-3" hidden={step !== 2}>
            <p className="text-sm text-muted-foreground">
              可选：邀请其他教师作为助教加入您的课程（可后续在课程详情调整）。
            </p>
            {collaborators.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-8 text-center text-sm text-muted-foreground">
                系统中暂无可邀请的其他教师
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {collaborators.map((c) => {
                  const checked = selectedCollabs.has(c.id);
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
                        type="checkbox"
                        name="collaboratorIds"
                        value={c.id}
                        checked={checked}
                        onChange={() => toggleCollab(c.id)}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-foreground">{c.name}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          {c.teacherNo && <span className="num font-mono">{c.teacherNo}</span>}
                          {c.subjects.length > 0 && (
                            <>
                              <span>·</span>
                              <span>{c.subjects.slice(0, 2).join(" / ")}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

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
          {step < STEPS.length - 1 ? (
            <Button
              type="button"
              disabled={!canNext}
              onClick={() => setStep((s) => s + 1)}
            >
              下一步
              <ChevronRight />
            </Button>
          ) : (
            <Button type="submit" disabled={pending}>
              {pending ? "创建中…" : "确认创建"}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}