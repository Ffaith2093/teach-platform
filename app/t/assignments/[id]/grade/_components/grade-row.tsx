"use client";

import * as React from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Save, CheckCircle2, Undo2 } from "lucide-react";
import { gradeAssignmentAction, returnAssignmentAction } from "@/app/t/assignments/actions";

const STATUS_TONE: Record<string, "default" | "warning" | "success" | "accent" | "danger"> = {
  DRAFT: "default",
  SUBMITTED: "warning",
  GRADED: "success",
  RETURNED: "accent",
};

interface GradeRowStudent {
  id: string;
  name: string;
  studentNo: string | null;
  className: string;
  gradeName: string;
}

interface GradeRowSubmission {
  id: string | null;
  status: "DRAFT" | "SUBMITTED" | "GRADED" | "RETURNED" | "NONE";
  autoScore: number | null;
  manualScore: number | null;
  finalScore: number | null;
  feedback: string | null;
  submittedAt: Date | null;
  gradedAt: Date | null;
}

export function GradeRow({
  student,
  submission,
  totalScore,
}: {
  student: GradeRowStudent;
  submission: GradeRowSubmission;
  totalScore: number;
}) {
  const [state, formAction, pending] = useActionState(gradeAssignmentAction, undefined);
  const [returnState, returnFormAction, returnPending] = useActionState(
    returnAssignmentAction,
    undefined,
  );
  const [justSaved, setJustSaved] = React.useState(false);
  const [justReturned, setJustReturned] = React.useState(false);
  const [returning, setReturning] = React.useState(false);

  React.useEffect(() => {
    if (state?.ok) {
      setJustSaved(true);
      const t = setTimeout(() => setJustSaved(false), 2000);
      return () => clearTimeout(t);
    }
  }, [state]);

  React.useEffect(() => {
    if (returnState?.ok) {
      setReturning(false);
      setJustReturned(true);
      const t = setTimeout(() => setJustReturned(false), 2000);
      return () => clearTimeout(t);
    }
  }, [returnState]);

  if (submission.id === null) {
    // 还没提交
    return (
      <tr className="bg-muted/20 text-muted-foreground">
        <td className="px-6 py-3.5 num font-mono text-xs">
          {student.studentNo ?? "—"}
        </td>
        <td className="px-6 py-3.5 font-medium">{student.name}</td>
        <td className="px-6 py-3.5 text-xs text-muted-foreground">{student.className}</td>
        <td className="px-6 py-3.5">
          <span className="text-xs text-subtle-foreground">未提交</span>
        </td>
        <td className="px-6 py-3.5 num">—</td>
        <td className="px-6 py-3.5 num">—</td>
        <td className="px-6 py-3.5 text-xs text-subtle-foreground">—</td>
        <td className="px-6 py-3.5"></td>
      </tr>
    );
  }

  const isGraded = submission.status === "GRADED";
  const isReturned = submission.status === "RETURNED";

  return (
    <tr className={isGraded ? "bg-success-subtle/10" : isReturned ? "bg-accent-subtle/20" : ""}>
      <td className="px-6 py-3.5 num font-mono text-xs text-muted-foreground">
        {student.studentNo ?? "—"}
      </td>
      <td className="px-6 py-3.5 font-medium text-foreground">{student.name}</td>
      <td className="px-6 py-3.5 text-xs text-muted-foreground">{student.className}</td>
      <td className="px-6 py-3.5">
        <span className="num text-xs text-muted-foreground">
          {submission.submittedAt ? new Date(submission.submittedAt).toLocaleString("zh-CN") : "—"}
        </span>
      </td>
      <td className="px-6 py-3.5 num text-sm">
        <span className="text-muted-foreground">自动</span>{" "}
        <span className="font-medium text-foreground">
          {submission.autoScore ?? "—"}
        </span>
        <span className="text-subtle-foreground"> / {totalScore}</span>
      </td>
      <td className="px-6 py-3.5">
        {returning ? (
          <form action={returnFormAction} className="flex items-start gap-2">
            <input type="hidden" name="submissionId" value={submission.id ?? ""} />
            <textarea
              name="feedback"
              required
              minLength={1}
              maxLength={2000}
              autoFocus
              rows={2}
              defaultValue={submission.feedback ?? ""}
              placeholder="告诉学生哪里需要修改（必填）"
              className="num min-h-8 flex-1 rounded-md border border-warning/40 bg-warning-subtle/30 px-2 py-1 text-xs focus:border-warning focus:outline-none"
            />
            <div className="flex flex-col gap-1.5">
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={returnPending}
                className="border-warning/40 text-warning hover:bg-warning-subtle"
              >
                {returnPending ? <Loader2 className="animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                确认退回
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setReturning(false)}
                disabled={returnPending}
                className="text-xs"
              >
                取消
              </Button>
            </div>
            {returnState?.error && (
              <div className="mt-1 text-[11px] text-danger">{returnState.error}</div>
            )}
          </form>
        ) : (
          <form action={formAction} className="flex items-start gap-2">
            <input type="hidden" name="submissionId" value={submission.id ?? ""} />
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  name="manualScore"
                  min={0}
                  max={totalScore}
                  defaultValue={submission.manualScore ?? submission.autoScore ?? ""}
                  placeholder={`0-${totalScore}`}
                  className="num h-8 w-20 rounded-md border border-border bg-card px-2 text-sm focus:border-primary focus:outline-none"
                />
                <span className="text-xs text-muted-foreground">/ {totalScore}</span>
                <textarea
                  name="feedback"
                  defaultValue={submission.feedback ?? ""}
                  placeholder="反馈（可选）"
                  rows={1}
                  className="num min-h-8 flex-1 rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none"
                />
              </div>
              {state?.error && (
                <div className="text-[11px] text-danger">{state.error}</div>
              )}
              {justSaved && (
                <div className="flex items-center gap-1 text-[11px] text-success">
                  <CheckCircle2 className="h-3 w-3" />
                  已保存
                </div>
              )}
              {justReturned && (
                <div className="flex items-center gap-1 text-[11px] text-warning">
                  <Undo2 className="h-3 w-3" />
                  已退回给学生
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Button type="submit" size="sm" variant={isGraded ? "outline" : "default"} disabled={pending}>
                {pending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {isGraded ? "重批" : "保存"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setReturning(true)}
                disabled={pending || returnPending}
                className="text-xs text-muted-foreground hover:text-warning"
                title="退回作业给学生重做"
              >
                <Undo2 className="h-3.5 w-3.5" />
                退回
              </Button>
            </div>
          </form>
        )}
      </td>
      <td className="px-6 py-3.5 num text-sm">
        {submission.finalScore != null ? (
          <span
            className={
              submission.finalScore >= totalScore * 0.8
                ? "text-success"
                : submission.finalScore >= totalScore * 0.6
                  ? "text-foreground"
                  : "text-danger"
            }
          >
            {submission.finalScore}
          </span>
        ) : submission.autoScore != null ? (
          <span className="text-muted-foreground">{submission.autoScore}</span>
        ) : (
          <span className="text-subtle-foreground">—</span>
        )}
      </td>
      <td className="px-6 py-3.5 text-xs text-muted-foreground num">
        {submission.gradedAt ? new Date(submission.gradedAt).toLocaleString("zh-CN") : "—"}
      </td>
    </tr>
  );
}
