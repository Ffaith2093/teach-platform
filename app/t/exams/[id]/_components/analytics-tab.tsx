import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { analyzeExam } from "@/lib/analytics/exam";
import { Users, TrendingUp, Award, Percent } from "lucide-react";
import type { Difficulty, QuestionType } from "@prisma/client";
import { ScoreDistributionChart } from "./score-distribution-chart";

const TYPE_LABEL: Record<QuestionType, string> = {
  SINGLE_CHOICE: "单选",
  FILL_BLANK: "填空",
  CODE_BLANK: "代码填空",
  PROGRAMMING: "编程",
};

export async function AnalyticsTab({ examId }: { examId: string }) {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { totalScore: true, title: true },
  });
  if (!exam) return null;

  const attempts = await prisma.examAttempt.findMany({
    where: {
      examId,
      status: { in: ["SUBMITTED", "GRADING", "GRADED"] },
    },
    select: {
      finalScore: true,
      autoScore: true,
      manualScore: true,
      answers: { select: { questionId: true, autoScore: true, manualScore: true } },
    },
  });

  const examQuestions = await prisma.examQuestion.findMany({
    where: { examId },
    orderBy: { order: "asc" },
    select: {
      order: true,
      score: true,
      question: {
        select: {
          id: true,
          type: true,
          content: true,
          difficulty: true,
        },
      },
    },
  });

  const questions = examQuestions.map((eq) => ({
    questionId: eq.question.id,
    type: eq.question.type,
    content: eq.question.content,
    score: eq.score,
    order: eq.order,
  }));

  const analytics = analyzeExam(attempts, questions, exam.totalScore);

  const questionMeta = new Map(
    examQuestions.map((eq) => [
      eq.question.id,
      {
        type: eq.question.type as QuestionType,
        difficulty: eq.question.difficulty as Difficulty,
      },
    ]),
  );

  const isEmpty = analytics.submittedCount === 0;

  const stats = [
    {
      icon: Users,
      label: "参考人数",
      num: analytics.submittedCount,
      hint: `应到 ${analytics.participantCount}`,
      tone: "primary" as const,
    },
    {
      icon: TrendingUp,
      label: "平均分",
      num: analytics.mean.toFixed(1),
      hint: `中位数 ${analytics.median.toFixed(1)}`,
      tone: "muted" as const,
    },
    {
      icon: Award,
      label: "最高 / 最低",
      num: `${analytics.max}`,
      hint: `最低 ${analytics.min}`,
      tone: "success" as const,
    },
    {
      icon: Percent,
      label: "及格率",
      num: `${(analytics.passRate * 100).toFixed(1)}%`,
      hint: `标准差 ${analytics.stdDev.toFixed(1)}`,
      tone: analytics.passRate >= 0.7 ? "success" : analytics.passRate >= 0.5 ? "warning" : "danger",
    },
  ];

  return (
    <div className="space-y-6">
      {isEmpty && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <Users className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">暂无提交</p>
            <p className="text-xs text-muted-foreground">等学生交卷后再来查看分析。</p>
          </CardContent>
        </Card>
      )}

      {!isEmpty && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {stats.map((s) => {
              const Icon = s.icon;
              return (
                <Card key={s.label}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <span className="text-sm text-muted-foreground">{s.label}</span>
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                          s.tone === "primary"
                            ? "bg-primary-subtle text-primary"
                            : s.tone === "success"
                              ? "bg-success-subtle text-success"
                              : s.tone === "warning"
                                ? "bg-warning-subtle text-warning"
                                : s.tone === "danger"
                                  ? "bg-danger-subtle text-danger"
                                  : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="mt-3 num text-3xl font-bold tracking-tight">{s.num}</div>
                    {s.hint && <div className="mt-1 text-xs text-muted-foreground">{s.hint}</div>}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <ScoreDistributionChart
            distribution={analytics.distribution}
            totalScore={exam.totalScore}
            submittedCount={analytics.submittedCount}
          />

          <Card>
            <CardContent className="p-6">
              <h3 className="text-base font-semibold">题目分析</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                按题号排序 · 得分率 = 班级平均分 ÷ 满分
              </p>
              <div className="mt-4 overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                      <th className="px-4 py-2.5 w-12">#</th>
                      <th className="px-4 py-2.5">题型</th>
                      <th className="px-4 py-2.5 max-w-[260px]">题干</th>
                      <th className="px-4 py-2.5 text-right">满分</th>
                      <th className="px-4 py-2.5 text-right">平均得分</th>
                      <th className="px-4 py-2.5 text-right">得分率</th>
                      <th className="px-4 py-2.5 w-32">分布</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {analytics.perQuestion.map((q) => {
                      const meta = questionMeta.get(q.questionId);
                      const tone = (q.scoreRate >= 0.8
                        ? "success"
                        : q.scoreRate >= 0.6
                          ? "primary"
                          : q.scoreRate >= 0.4
                            ? "warning"
                            : "danger") as "success" | "primary" | "warning" | "danger";
                      return (
                        <tr key={q.questionId} className="hover:bg-muted/30">
                          <td className="px-4 py-2.5 num font-mono text-xs text-muted-foreground">
                            {q.order + 1}
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge variant="default" className="font-normal">
                              {TYPE_LABEL[meta?.type ?? "SINGLE_CHOICE"]}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5 max-w-[260px] truncate text-foreground">
                            {q.type === "PROGRAMMING"
                              ? `（编程题）${q.content.slice(0, 40)}`
                              : q.content.slice(0, 60)}
                          </td>
                          <td className="px-4 py-2.5 num text-right text-muted-foreground">
                            {q.fullScore}
                          </td>
                          <td className="px-4 py-2.5 num text-right text-foreground">
                            {q.mean.toFixed(1)}
                          </td>
                          <td className="px-4 py-2.5 num text-right">
                            <span
                              className={
                                tone === "success"
                                  ? "text-success"
                                  : tone === "primary"
                                    ? "text-primary"
                                    : tone === "warning"
                                      ? "text-warning"
                                      : "text-danger"
                              }
                            >
                              {(q.scoreRate * 100).toFixed(0)}%
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className={`h-full rounded-full ${
                                  tone === "success"
                                    ? "bg-success"
                                    : tone === "primary"
                                      ? "bg-primary"
                                      : tone === "warning"
                                        ? "bg-warning"
                                        : "bg-danger"
                                }`}
                                style={{ width: `${Math.max(2, q.scoreRate * 100)}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}