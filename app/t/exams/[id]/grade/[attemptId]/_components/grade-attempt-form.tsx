"use client";

import { useMemo, useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, Save, Loader2 } from "lucide-react";
import {
  gradeAttemptAction,
  type GradeAttemptState,
} from "@/app/t/exams/[id]/grade/actions";
import type { QuestionType } from "@prisma/client";

type Q = {
  index: number;
  questionId: string;
  type: QuestionType;
  content: string;
  score: number;
  options: { key: string; text: string }[] | null;
  problem: { title: string; description: string; starterCode: string } | null;
  autoScore: number | null;
  manualScore: number | null;
  comment: string | null;
  answerContent: unknown;
  isManual: boolean;
};

export function GradeAttemptForm({
  attemptId,
  examId,
  totalScore,
  questions,
}: {
  attemptId: string;
  examId: string;
  totalScore: number;
  questions: Q[];
}) {
  // 初始值：manual 题来自 DB；auto 题留空（不可改）
  const initial = useMemo(() => {
    const m: Record<string, { manualScore: string; comment: string }> = {};
    for (const q of questions) {
      if (q.isManual) {
        m[q.questionId] = {
          manualScore: q.manualScore != null ? String(q.manualScore) : "",
          comment: q.comment ?? "",
        };
      }
    }
    return m;
  }, [questions]);

  const [draft, setDraft] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<GradeAttemptState | null>(null);

  const manualQuestions = questions.filter((q) => q.isManual);

  const totalPreview = useMemo(() => {
    return Math.max(0, Math.min(questions.reduce((sum, q) => {
      const entered = q.isManual ? draft[q.questionId]?.manualScore : undefined;
      const manual = entered !== undefined && entered !== "" ? Number(entered) : q.manualScore;
      return sum + (manual ?? q.autoScore ?? 0);
    }, 0), totalScore));
  }, [draft, questions, totalScore]);

  const autoPreview = useMemo(
    () => questions.reduce((s, q) => s + (q.autoScore ?? 0), 0),
    [questions],
  );
  const manualPreview = questions.reduce((sum, q) => sum + (q.isManual ? Number(draft[q.questionId]?.manualScore || q.manualScore || 0) : q.manualScore ?? 0), 0);

  function setField(qid: string, key: "manualScore" | "comment", value: string) {
    setDraft((prev) => ({
      ...prev,
      [qid]: { ...prev[qid], [key]: value },
    }));
  }

  function onSave() {
    const grades = manualQuestions
      .map((q) => ({
        questionId: q.questionId,
        manualScore: Number(draft[q.questionId]?.manualScore ?? 0),
        comment: draft[q.questionId]?.comment ?? "",
      }))
      .filter((g) => Number.isFinite(g.manualScore));
    setState(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("grades", JSON.stringify(grades));
      const res = await gradeAttemptAction(attemptId, undefined, fd);
      setState(res);
    });
  }

  return (
    <div className="flex flex-col gap-6 pb-32">
      {questions.map((q) => (
        <Card key={q.questionId}>
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="num text-sm font-semibold text-primary">第 {q.index} 题</span>
                <Badge variant="default">{TYPE_LABEL[q.type]}</Badge>
                {!q.isManual && <Badge variant="primary">客观题 · 系统判分</Badge>}
                {q.isManual && <Badge variant="warning">主观题 · 人工评分</Badge>}
              </div>
              <span className="num shrink-0 text-xs text-muted-foreground">满分 {q.score}</span>
            </div>

            <p className="mt-3 whitespace-pre-line text-sm text-foreground">
              {q.isManual && q.problem ? q.problem.title : q.content}
            </p>

            {q.isManual && q.problem && (
              <p className="mt-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                {q.problem.description}
              </p>
            )}

            {/* 学生作答 */}
            <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4">
              <div className="mb-2 text-xs font-medium text-muted-foreground">学生作答</div>
              <StudentAnswer q={q} />
            </div>

            {!q.isManual ? (
              <div className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                <CheckCircle2
                  className={`h-4 w-4 ${q.autoScore === q.score ? "text-success" : q.autoScore === 0 ? "text-danger" : "text-warning"}`}
                />
                <div className="text-sm">
                  客观题得分：
                  <span className="num ml-1 font-medium text-foreground">
                    {q.autoScore ?? 0}
                  </span>
                  <span className="ml-1 text-muted-foreground">/ {q.score}</span>
                </div>
                <span className="ml-auto text-xs text-muted-foreground">
                  系统自动判分，无需手动批改
                </span>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-3">
                  <label className="text-xs text-muted-foreground">分数</label>
                  <input
                    type="number"
                    min={0}
                    max={q.score}
                    value={draft[q.questionId]?.manualScore ?? ""}
                    onChange={(e) => setField(q.questionId, "manualScore", e.target.value)}
                    className="num h-9 w-24 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                    placeholder={`0-${q.score}`}
                  />
                  <span className="text-xs text-muted-foreground">/ {q.score} 分</span>
                  {q.autoScore != null && q.autoScore > 0 && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      自动分 <span className="num">{q.autoScore}</span>（参考）
                    </span>
                  )}
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">评语（可选）</label>
                  <textarea
                    value={draft[q.questionId]?.comment ?? ""}
                    onChange={(e) => setField(q.questionId, "comment", e.target.value)}
                    rows={2}
                    maxLength={500}
                    placeholder="给学生的一句话点评…"
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {/* sticky 总分预览 + 保存 */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-[980px] items-center gap-4 px-8 py-3">
          <div className="flex items-baseline gap-2 text-sm">
            <span className="text-muted-foreground">总分预览</span>
            <span className="num text-2xl font-bold text-foreground">{totalPreview}</span>
            <span className="text-muted-foreground">
              / <span className="num">{totalScore}</span>
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              客观 <span className="num">{autoPreview}</span>
            </span>
            <span>·</span>
            <span>
              手动 <span className="num">{manualPreview}</span>
            </span>
          </div>
          {state?.error && (
            <span className="flex items-center gap-1 text-xs text-danger">
              <AlertCircle className="h-3 w-3" />
              {state.error}
            </span>
          )}
          {state?.ok && (
            <span className="flex items-center gap-1 text-xs text-success">
              <CheckCircle2 className="h-3 w-3" />
              已保存 {state.saved} 题
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button
              onClick={onSave}
              disabled={pending || manualQuestions.length === 0}
              size="sm"
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              保存评分
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StudentAnswer({ q }: { q: Q }) {
  const c = q.answerContent;

  if (c === null || c === undefined || c === "") {
    return <p className="text-xs italic text-subtle-foreground">学生未作答</p>;
  }

  if (q.type === "SINGLE_CHOICE" && typeof c === "string") {
    return (
      <div className="flex flex-col gap-1">
        {(q.options ?? []).map((o) => {
          const picked = c === o.key;
          return (
            <div
              key={o.key}
              className={`flex items-start gap-2 rounded-md border px-3 py-1.5 text-sm ${
                picked
                  ? "border-primary bg-primary-subtle"
                  : "border-border bg-card"
              }`}
            >
              <span className="num font-medium">{o.key}.</span>
              <span>{o.text}</span>
              {picked && <span className="ml-auto text-xs text-primary">已选</span>}
            </div>
          );
        })}
      </div>
    );
  }

  if ((q.type === "FILL_BLANK" || q.type === "CODE_BLANK") && Array.isArray(c)) {
    return (
      <div className="flex flex-col gap-1.5">
        {c.map((v, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="num w-14 shrink-0 text-xs text-muted-foreground">空 {i + 1}</span>
            <span className="rounded-md border border-border bg-card px-3 py-1.5 font-mono text-xs">
              {String(v ?? "")}
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (q.type === "PROGRAMMING") {
    return (
      <pre className="overflow-x-auto rounded-md border border-border bg-card p-3 font-mono text-xs leading-relaxed">
        {typeof c === "string" ? c : JSON.stringify(c, null, 2)}
      </pre>
    );
  }

  return (
    <pre className="overflow-x-auto rounded-md border border-border bg-card p-3 text-xs">
      {JSON.stringify(c, null, 2)}
    </pre>
  );
}

const TYPE_LABEL: Record<QuestionType, string> = {
  SINGLE_CHOICE: "单选题",
  FILL_BLANK: "填空题",
  CODE_BLANK: "代码填空",
  PROGRAMMING: "编程题",
};
