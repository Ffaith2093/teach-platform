import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { analyzeExam } from "@/lib/analytics/exam";
import {
  Users,
  TrendingUp,
  Award,
  Percent,
  Bug,
  Trophy,
  AlertTriangle,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
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

  const [attempts, examQuestions] = await Promise.all([
    prisma.examAttempt.findMany({
      where: {
        examId,
        status: { in: ["SUBMITTED", "GRADING", "GRADED"] },
      },
      select: {
        id: true,
        finalScore: true,
        autoScore: true,
        manualScore: true,
        submittedAt: true,
        student: { select: { id: true, name: true, studentNo: true } },
        answers: {
          select: { questionId: true, autoScore: true, manualScore: true },
        },
      },
    }),
    prisma.examQuestion.findMany({
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
            problemId: true,
            problem: { select: { title: true } },
          },
        },
      },
    }),
  ]);

  const questions = examQuestions.map((eq) => ({
    questionId: eq.question.id,
    type: eq.question.type,
    content: eq.question.content,
    score: eq.score,
    order: eq.order,
  }));

  // 传给 analyzer：注入学生信息用于 TOP/BOTTOM
  const attemptsForAnalysis = attempts.map((a) => ({
    id: a.id,
    studentId: a.student?.id ?? "",
    studentName: a.student?.name ?? "",
    submittedAt: a.submittedAt,
    finalScore: a.finalScore,
    autoScore: a.autoScore,
    manualScore: a.manualScore,
    answers: a.answers,
  }));

  const analytics = analyzeExam(attemptsForAnalysis, questions, exam.totalScore);

  const questionMeta = new Map(
    examQuestions.map((eq) => [
      eq.question.id,
      {
        order: eq.order,
        type: eq.question.type as QuestionType,
        difficulty: eq.question.difficulty as Difficulty,
        problemId: eq.question.problemId,
        problemTitle: eq.question.problem?.title ?? null,
      },
    ]),
  );

  // ===== 高频错误用例（仅 PROGRAMMING 题） =====
  type ErrorCase = {
    questionId: string;
    testCaseId: string;
    order: number;
    input: string;
    expected: string;
    score: number;
    problemTitle: string;
    failCount: number;
    totalCount: number;
  };
  let errorCases: ErrorCase[] = [];
  const programmingQuestionIds = examQuestions
    .filter((eq) => eq.question.type === "PROGRAMMING" && eq.question.problemId)
    .map((eq) => ({ questionId: eq.question.id, problemId: eq.question.problemId! }));
  const programmingProblemIds = programmingQuestionIds.map((q) => q.problemId);
  const attemptIds = attempts.map((a) => a.id);

  if (programmingProblemIds.length > 0 && attemptIds.length > 0) {
    const [grouped, totalSubs] = await Promise.all([
      prisma.judgeCase.groupBy({
        by: ["testCaseId"],
        where: {
          status: { not: "ACCEPTED" },
          submission: {
            contextType: "EXAM",
            problemId: { in: programmingProblemIds },
            contextId: { in: attemptIds },
          },
        },
        _count: { _all: true },
      }),
      prisma.submission.groupBy({
        by: ["problemId"],
        where: {
          contextType: "EXAM",
          problemId: { in: programmingProblemIds },
          contextId: { in: attemptIds },
        },
        _count: { _all: true },
      }),
    ]);
    if (grouped.length > 0) {
      const testCases = await prisma.testCase.findMany({
        where: { id: { in: grouped.map((g) => g.testCaseId) } },
        select: {
          id: true,
          order: true,
          input: true,
          expected: true,
          score: true,
          problemId: true,
          problem: { select: { title: true } },
        },
      });
      const totalByProblem = new Map(
        totalSubs.map((s) => [s.problemId, s._count._all]),
      );
      const qByProblem = new Map(
        programmingQuestionIds.map((q) => [q.problemId, q.questionId]),
      );
      errorCases = testCases
        .map((tc) => ({
          questionId: qByProblem.get(tc.problemId) ?? "",
          testCaseId: tc.id,
          order: tc.order,
          input: tc.input,
          expected: tc.expected,
          score: tc.score,
          problemTitle: tc.problem.title,
          failCount: grouped.find((g) => g.testCaseId === tc.id)?._count._all ?? 0,
          totalCount: totalByProblem.get(tc.problemId) ?? 0,
        }))
        .filter((c) => c.failCount > 0 && c.totalCount > 0 && c.questionId)
        .sort((a, b) => {
          // 失败率 desc -> 失败次数 desc
          const rA = a.totalCount ? a.failCount / a.totalCount : 0;
          const rB = b.totalCount ? b.failCount / b.totalCount : 0;
          if (rB !== rA) return rB - rA;
          return b.failCount - a.failCount;
        })
        .slice(0, 10);
    }
  }

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
      tone: analytics.passRate >= 0.7 ? ("success" as const) : analytics.passRate >= 0.5 ? ("warning" as const) : ("danger" as const),
    },
  ];

  // 区分度评级
  function discriminationTone(d: number | null): "success" | "primary" | "warning" | "muted" | null {
    if (d == null) return null;
    if (d >= 0.4) return "success";
    if (d >= 0.2) return "primary";
    return "warning";
  }
  function discriminationLabel(d: number | null): string {
    if (d == null) return "样本不足";
    if (d >= 0.4) return "优秀";
    if (d >= 0.2) return "良好";
    if (d >= 0) return "一般";
    return "反向"; // 罕见：低分组比高分组考得好
  }

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
          {/* 概览 4 张卡 */}
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

          {/* 分数分布 */}
          <ScoreDistributionChart
            distribution={analytics.distribution}
            totalScore={exam.totalScore}
            submittedCount={analytics.submittedCount}
          />

          {/* 题目分析 */}
          <Card>
            <CardContent className="p-6">
              <h3 className="text-base font-semibold">题目分析</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                得分率 = 平均分 ÷ 满分 · 区分度 = 高分 27% 组 − 低分 27% 组（≥0.4 优秀 / ≥0.2 良好 / &lt;0.2 较差）
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
                      <th className="px-4 py-2.5">区分度</th>
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
                      const dTone = discriminationTone(q.discrimination);
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
                          <td className="px-4 py-2.5">
                            {dTone == null ? (
                              <span className="text-xs text-muted-foreground">
                                {discriminationLabel(q.discrimination)}
                              </span>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`inline-block h-2 w-2 rounded-full ${
                                    dTone === "success"
                                      ? "bg-success"
                                      : dTone === "primary"
                                        ? "bg-primary"
                                        : dTone === "warning"
                                          ? "bg-warning"
                                          : "bg-muted-foreground"
                                  }`}
                                />
                                <span
                                  className={`num text-xs ${
                                    dTone === "success"
                                      ? "text-success"
                                      : dTone === "primary"
                                        ? "text-primary"
                                        : "text-warning"
                                  }`}
                                >
                                  {q.discrimination!.toFixed(2)}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {discriminationLabel(q.discrimination)}
                                </span>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* TOP/BOTTOM 学生 */}
          {(analytics.topPerformers.length > 0 || analytics.bottomPerformers.length > 0) && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <PerformersCard
                title="前列学生"
                icon={Trophy}
                iconTone="success"
                subtitle={`Top ${analytics.topPerformers.length}`}
                performers={analytics.topPerformers}
                totalScore={exam.totalScore}
                badgeTone="success"
              />
              <PerformersCard
                title="末列学生"
                icon={AlertTriangle}
                iconTone="warning"
                subtitle="需关注"
                performers={analytics.bottomPerformers}
                totalScore={exam.totalScore}
                badgeTone="warning"
              />
            </div>
          )}

          {/* 高频错误用例 */}
          {errorCases.length > 0 && (
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="flex items-center gap-2 text-base font-semibold">
                      <Bug className="h-4 w-4 text-warning" />
                      高频错误用例
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      编程题里学生最容易栽跟头的用例（按失败率降序）
                    </p>
                  </div>
                  <Badge variant="warning">
                    <span className="num">{errorCases.length}</span> 个
                  </Badge>
                </div>
                <div className="mt-4 space-y-3">
                  {errorCases.map((c) => {
                    const meta = questionMeta.get(c.questionId);
                    const failRate = c.totalCount ? c.failCount / c.totalCount : 0;
                    return (
                      <div
                        key={c.testCaseId}
                        className="rounded-lg border border-warning/30 bg-warning-subtle/20 p-4"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="default" className="font-normal">
                            第 {meta?.order !== undefined ? meta.order + 1 : "?"} 题
                          </Badge>
                          <span className="truncate text-sm font-medium text-foreground">
                            {c.problemTitle}
                          </span>
                          <Badge variant="warning" className="ml-auto font-normal">
                            用例 #{c.order + 1}
                          </Badge>
                          <span className="num text-xs text-warning">
                            {c.failCount} / {c.totalCount}（{(failRate * 100).toFixed(0)}%）
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div>
                            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                              输入
                            </div>
                            <pre className="mt-0.5 overflow-x-auto whitespace-pre rounded bg-muted/60 px-2.5 py-1.5 font-mono text-[11px] text-foreground">
                              {c.input || "（空）"}
                            </pre>
                          </div>
                          <div>
                            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                              期望输出
                            </div>
                            <pre className="mt-0.5 overflow-x-auto whitespace-pre rounded bg-muted/60 px-2.5 py-1.5 font-mono text-[11px] text-foreground">
                              {c.expected || "（空）"}
                            </pre>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function PerformersCard({
  title,
  icon: Icon,
  iconTone,
  subtitle,
  performers,
  totalScore,
  badgeTone,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  iconTone: "success" | "warning";
  subtitle: string;
  performers: { studentId: string; studentName: string; submittedAt: Date | string | null; score: number }[];
  totalScore: number;
  badgeTone: "success" | "warning";
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                iconTone === "success"
                  ? "bg-success-subtle text-success"
                  : "bg-warning-subtle text-warning"
              }`}
            >
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold">{title}</h3>
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          {performers.length > 0 && (
            <Badge variant={badgeTone}>
              <span className="num">{performers.length}</span> 人
            </Badge>
          )}
        </div>
        {performers.length === 0 ? (
          <div className="mt-4 flex flex-col items-center gap-2 px-4 py-8 text-center">
            <Users className="h-6 w-6 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">暂无数据</p>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
            {performers.map((p, i) => {
              const rate = totalScore > 0 ? p.score / totalScore : 0;
              return (
                <li
                  key={p.studentId}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/30"
                >
                  <span className="num w-6 shrink-0 font-mono text-xs text-muted-foreground">
                    {iconTone === "success" ? `#${i + 1}` : i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {p.studentName}
                  </span>
                  <span
                    className={`num text-sm font-semibold ${
                      iconTone === "success" ? "text-success" : "text-warning"
                    }`}
                  >
                    {p.score}
                  </span>
                  <span className="num text-xs text-muted-foreground">
                    / {totalScore}
                  </span>
                  {p.submittedAt && (
                    <span className="hidden text-[11px] text-subtle-foreground sm:inline">
                      {formatDate(typeof p.submittedAt === "string" ? p.submittedAt : p.submittedAt.toISOString())}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
