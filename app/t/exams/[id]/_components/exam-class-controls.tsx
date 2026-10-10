"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, Play, RotateCw, Square } from "lucide-react";
import { closeExamClassAction, openExamClassAction } from "@/app/t/exams/actions";

type ClassOption = {
  id: string;
  label: string;
  studentCount: number;
};

const STATUS = {
  PENDING: { label: "等待开考", tone: "default" as const },
  OPEN: { label: "考试进行中", tone: "success" as const },
  CLOSED: { label: "已结束", tone: "warning" as const },
};

export function ExamClassControls({
  examId,
  examStatus,
  activeTab,
  classes,
  selectedClassId,
  sessionStatus,
  openedAt,
  closedAt,
}: {
  examId: string;
  examStatus: "DRAFT" | "PUBLISHED" | "CLOSED";
  activeTab: string;
  classes: ClassOption[];
  selectedClassId: string;
  sessionStatus: "PENDING" | "OPEN" | "CLOSED";
  openedAt: string | null;
  closedAt: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const selected = classes.find((item) => item.id === selectedClassId);
  const status = STATUS[sessionStatus];

  function selectClass(classId: string) {
    const qs = new URLSearchParams({ tab: activeTab, classId });
    router.push(`/t/exams/${examId}?${qs}`);
  }

  function openClass() {
    if (!confirm(`确定为“${selected?.label ?? "当前班级"}”开放考试吗？`)) return;
    startTransition(async () => {
      try {
        await openExamClassAction(examId, selectedClassId);
        router.refresh();
      } catch (error) {
        alert((error as Error).message);
      }
    });
  }

  function closeClass() {
    const message = sessionStatus === "CLOSED"
      ? `重新检查“${selected?.label ?? "当前班级"}”是否还有未收卷的答卷吗？`
      : `确定结束“${selected?.label ?? "当前班级"}”的考试吗？系统会立即收卷并自动批改，结束后不能重新开放。`;
    if (!confirm(message)) return;
    startTransition(async () => {
      try {
        const result = await closeExamClassAction(examId, selectedClassId);
        if (result.failed > 0) {
          alert(`已结束考试，但有 ${result.failed} 份试卷收卷失败，请再次检查监考页面。`);
        }
        router.refresh();
      } catch (error) {
        alert((error as Error).message);
      }
    });
  }

  if (!classes.length) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 px-5 py-8 text-center text-sm text-muted-foreground">
        本课程还没有关联班级，请先在课程设置中添加授课班级。
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="space-y-2">
        <label htmlFor="exam-class" className="text-xs font-medium text-muted-foreground">
          查看班级
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <select
            id="exam-class"
            value={selectedClassId}
            onChange={(event) => selectClass(event.target.value)}
            className="h-10 min-w-56 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
          >
            {classes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}（{item.studentCount} 人）
              </option>
            ))}
          </select>
          <Badge variant={status.tone}>{status.label}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {sessionStatus === "PENDING"
            ? "学生暂时不能进入考试。"
            : sessionStatus === "OPEN"
              ? `开放于 ${openedAt ?? "刚刚"}，学生可开始和继续作答。`
              : `结束于 ${closedAt ?? "刚刚"}，成绩已进入自动批改流程。`}
        </p>
      </div>

      {examStatus === "PUBLISHED" && (
        <div className="flex items-center gap-2">
          {sessionStatus === "PENDING" && (
            <Button onClick={openClass} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Play />}
              开放本班考试
            </Button>
          )}
          {sessionStatus === "OPEN" && (
            <Button variant="outline" onClick={closeClass} disabled={pending} className="text-danger hover:bg-danger-subtle hover:text-danger">
              {pending ? <Loader2 className="animate-spin" /> : <Square />}
              结束并收卷
            </Button>
          )}
          {sessionStatus === "CLOSED" && (
            <>
              <span className="inline-flex items-center gap-1.5 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" />
                本班考试已完成
              </span>
              <Button variant="outline" size="sm" onClick={closeClass} disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : <RotateCw />}
                检查收卷
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
