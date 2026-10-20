import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";
import type { QuestionType } from "@prisma/client";

type QuestionReview = {
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
  totalScore,
  questions,
}: {
  attemptId: string;
  examId: string;
  totalScore: number;
  questions: QuestionReview[];
}) {
  const automaticTotal = Math.min(
    totalScore,
    questions.reduce((sum, question) => sum + (question.autoScore ?? 0), 0),
  );
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex items-center justify-between gap-4 p-6">
          <div>
            <div className="text-sm text-muted-foreground">系统自动得分</div>
            <div className="mt-1 text-xs text-muted-foreground">
              考试结束后自动公布，无需人工批改
            </div>
          </div>
          <div className="text-3xl font-bold tabular-nums text-primary">
            {automaticTotal}
            <span className="ml-1 text-base font-normal text-muted-foreground">/ {totalScore}</span>
          </div>
        </CardContent>
      </Card>
      {questions.map((question) => (
        <Card key={question.questionId}>
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-primary">第 {question.index} 题</span>
                <Badge variant="default">{TYPE_LABEL[question.type]}</Badge>
                <Badge variant="primary">系统自动评分</Badge>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {question.autoScore ?? 0} / {question.score} 分
              </span>
            </div>
            <p className="mt-3 whitespace-pre-line text-sm text-foreground">
              {question.type === "PROGRAMMING" && question.problem
                ? question.problem.title
                : question.content}
            </p>
            {question.problem && (
              <p className="mt-2 whitespace-pre-line rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                {question.problem.description}
              </p>
            )}
            <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4">
              <div className="mb-2 text-xs font-medium text-muted-foreground">学生作答</div>
              <StudentAnswer question={question} />
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm">
              <CheckCircle2
                className={
                  question.autoScore === question.score
                    ? "h-4 w-4 text-success"
                    : "h-4 w-4 text-muted-foreground"
                }
              />
              <span>
                自动得分{" "}
                <b className="tabular-nums">
                  {question.autoScore ?? 0} / {question.score}
                </b>
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function StudentAnswer({ question }: { question: QuestionReview }) {
  const content = question.answerContent;
  if (content === null || content === undefined || content === "")
    return <p className="text-xs italic text-subtle-foreground">学生未作答</p>;
  if (question.type === "SINGLE_CHOICE" && typeof content === "string") {
    return (
      <div className="space-y-1.5">
        {(question.options ?? []).map((option) => (
          <div
            key={option.key}
            className={`flex gap-2 rounded-md border px-3 py-2 text-sm ${content === option.key ? "border-primary bg-primary-subtle" : "border-border bg-card"}`}
          >
            <b>{option.key}.</b>
            <span>{option.text}</span>
            {content === option.key && <span className="ml-auto text-xs text-primary">已选</span>}
          </div>
        ))}
      </div>
    );
  }
  if (
    (question.type === "FILL_BLANK" || question.type === "CODE_BLANK") &&
    Array.isArray(content)
  ) {
    return (
      <div className="space-y-2">
        {content.map((value, index) => (
          <div key={index} className="flex items-center gap-2 text-sm">
            <span className="w-12 text-xs text-muted-foreground">空 {index + 1}</span>
            <code className="rounded-md border border-border bg-card px-3 py-1.5">
              {String(value ?? "")}
            </code>
          </div>
        ))}
      </div>
    );
  }
  return (
    <pre className="max-h-[520px] overflow-auto rounded-md border border-border bg-card p-4 font-mono text-sm leading-6">
      {typeof content === "string" ? content : JSON.stringify(content, null, 2)}
    </pre>
  );
}

const TYPE_LABEL: Record<QuestionType, string> = {
  SINGLE_CHOICE: "单选题",
  FILL_BLANK: "填空题",
  CODE_BLANK: "填空题",
  PROGRAMMING: "编程题",
};
