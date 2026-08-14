import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Topbar } from "@/components/shell/topbar";
import {
  ChevronLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Code,
  ListChecks,
  AlertCircle,
  Trophy,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { ResultMode } from "@prisma/client";

export const metadata = { title: "考试成绩" };

export default async function ExamResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userId = session!.user.id;
  const now = new Date();

  const exam = await prisma.exam.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      totalScore: true,
      durationMin: true,
      openAt: true,
      closeAt: true,
      status: true,
      showResultMode: true,
      course: { select: { id: true, title: true } },
    },
  });
  if (!exam) notFound();

  // 找学生这次考试最近一次 attempt（已交卷）
  const attempt = await prisma.examAttempt.findFirst({
    where: { examId: id, studentId: userId, submittedAt: { not: null } },
    orderBy: { submittedAt: "desc" },
    include: {
      answers: {
        select: {
          questionId: true,
          content: true,
          autoScore: true,
          manualScore: true,
          comment: true,
        },
      },
    },
  });

  // 是否允许查看结果（showResultMode 判定）
  const canView = (() => {
    if (!attempt) return false;
    switch (exam.showResultMode as ResultMode) {
      case "IMMEDIATELY":
        return true;
      case "AFTER_CLOSE":
        return now >= exam.closeAt || exam.status === "CLOSED";
      case "AFTER_GRADED":
        return attempt.status === "GRADED";
      case "NEVER":
        return false;
    }
  })();

  if (!attempt) {
    return (
      <>
        <Topbar
          crumbs={[
            { label: "我的考试", href: "/exams" },
            { label: exam.title, href: `/exams/${exam.id}` },
            { label: "成绩" },
          ]}
        />
        <main className="flex-1 p-8">
          <div className="mx-auto max-w-[1280px]">
            <Card>
              <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <AlertCircle className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">您还未参加这场考试</p>
                <Link href={`/exams/${exam.id}`} className="text-xs text-primary hover:underline">
                  返回考试详情 →
                </Link>
              </CardContent>
            </Card>
          </div>
        </main>
      </>
    );
  }

  if (!canView) {
    return (
      <>
        <Topbar
          crumbs={[
            { label: "我的考试", href: "/exams" },
            { label: exam.title, href: `/exams/${exam.id}` },
            { label: "成绩" },
          ]}
        />
        <main className="flex-1 p-8">
          <div className="mx-auto max-w-[1280px]">
            <Card>
              <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <Clock className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">成绩暂未公布</p>
                <p className="text-xs text-muted-foreground">
                  {exam.showResultMode === "AFTER_CLOSE"
                    ? `考试结束后公布（${formatDate(exam.closeAt)}）`
                    : exam.showResultMode === "AFTER_GRADED"
                      ? "教师批改完成后公布"
                      : "教师已设置不公布成绩"}
                </p>
                <Link href={`/exams/${exam.id}`} className="mt-1 text-xs text-primary hover:underline">
                  返回考试详情 →
                </Link>
              </CardContent>
            </Card>
          </div>
        </main>
      </>
    );
  }

  // 拉所有题目 + Answer + JudgeCase
  const examQuestions = await prisma.examQuestion.findMany({
    where: { examId: id },
    orderBy: { order: "asc" },
    select: {
      questionId: true,
      score: true,
      question: {
        select: {
          id: true,
          type: true,
          content: true,
          options: true,
          answer: true,
          explanation: true,
          problem: { select: { id: true, title: true } },
        },
      },
    },
  });

  // 按 attempt.questionIds 顺序排列
  const orderMap = new Map<string, number>();
  attempt.questionIds.forEach((qid, i) => orderMap.set(qid, i));
  const ordered = [...examQuestions].sort((a, b) => {
    const ai = orderMap.get(a.questionId) ?? 999;
    const bi = orderMap.get(b.questionId) ?? 999;
    return ai - bi;
  });

  const answerMap = new Map(attempt.answers.map((a) => [a.questionId, a]));

  // 编程题 judge cases（按 contextType=EXAM + contextId=attempt.id 查）
  const programmingProblemIds = ordered
    .filter((eq) => eq.question.type === "PROGRAMMING" && eq.question.problem)
    .map((eq) => eq.question.problem!.id);

  const submissions = programmingProblemIds.length
    ? await prisma.submission.findMany({
        where: {
          userId,
          contextType: "EXAM",
          contextId: attempt.id,
          problemId: { in: programmingProblemIds },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          problemId: true,
          score: true,
          passedCount: true,
          totalCount: true,
          maxTimeMs: true,
          status: true,
          judgeCases: {
            select: {
              status: true,
              timeMs: true,
              actualOutput: true,
              testCase: { select: { order: true, isSample: true } },
            },
            orderBy: { testCase: { order: "asc" } },
          },
        },
      })
    : [];
  // 同一题多次提交时取最新
  const submissionByProblemId = new Map<string, typeof submissions[number]>();
  for (const s of submissions) {
    if (!submissionByProblemId.has(s.problemId)) submissionByProblemId.set(s.problemId, s);
  }

  const totalScore = attempt.finalScore ?? attempt.autoScore ?? 0;
  const ratio = exam.totalScore > 0 ? totalScore / exam.totalScore : 0;
  const ratioBadge =
    ratio >= 0.85 ? "success" : ratio >= 0.6 ? "warning" : "danger";

  return (
    <>
      <Topbar
        crumbs={[
          { label: "我的考试", href: "/exams" },
          { label: exam.title, href: `/exams/${exam.id}` },
          { label: "成绩" },
        ]}
      />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1024px] flex-col gap-6">
          <Link
            href={`/exams/${exam.id}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            返回考试详情
          </Link>

          {/* 总分卡 */}
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">考试成绩</p>
                  <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">{exam.title}</h1>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <Badge variant="primary">{exam.course.title}</Badge>
                    <span>·</span>
                    <span>交卷时间 {formatDate(attempt.submittedAt!)}</span>
                    <span>·</span>
                    <span>用时 {Math.round((attempt.submittedAt!.getTime() - attempt.startedAt.getTime()) / 60000)} 分钟</span>
                  </div>
                </div>
                <div className="flex items-center gap-5 rounded-2xl border border-border bg-muted/30 px-6 py-4">
                  <Trophy className="h-10 w-10 text-primary" />
                  <div>
                    <div className="text-xs text-muted-foreground">最终得分</div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="num text-4xl font-bold tracking-tight">{totalScore}</span>
                      <span className="text-muted-foreground">/ {exam.totalScore}</span>
                      <Badge variant={ratioBadge as "success" | "warning" | "danger"}>
                        <span className="num">{Math.round(ratio * 100)}</span>
                        <span className="text-subtle-foreground">%</span>
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 题目逐题详情 */}
          <div className="space-y-4">
            <h2 className="text-base font-semibold">逐题详情</h2>
            {ordered.map((eq, i) => {
              const q = eq.question;
              const ans = answerMap.get(eq.questionId);
              const isProgramming = q.type === "PROGRAMMING" && q.problem;
              const sub = isProgramming ? submissionByProblemId.get(q.problem!.id) : null;

              const autoScore = ans?.autoScore ?? null;
              const manualScore = ans?.manualScore ?? null;
              const finalQScore =
                manualScore != null ? manualScore : autoScore ?? 0;
              const isFull = finalQScore >= eq.score;
              const isPartial = finalQScore > 0 && finalQScore < eq.score;

              return (
                <Card key={eq.questionId}>
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                          isFull
                            ? "bg-success-subtle text-success"
                            : isPartial
                              ? "bg-warning-subtle text-warning"
                              : "bg-danger-subtle text-danger"
                        }`}
                      >
                        {isFull ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <XCircle className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">第 {i + 1} 题</span>
                          <Badge variant="default">
                            {isProgramming ? "编程" : q.type === "SINGLE_CHOICE" ? "单选" : q.type === "FILL_BLANK" ? "填空" : q.type === "CODE_BLANK" ? "代码填空" : "其他"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">满分 {eq.score}</span>
                          <span className="ml-auto">
                            <span
                              className={`num text-base font-semibold ${
                                isFull ? "text-success" : isPartial ? "text-warning" : "text-danger"
                              }`}
                            >
                              {finalQScore}
                            </span>
                            <span className="text-xs text-subtle-foreground"> / {eq.score}</span>
                          </span>
                        </div>

                        {/* 题干 */}
                        <div className="mt-3 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-foreground">
                          {q.content}
                        </div>

                        {/* 客观题：选项 + 你的答案 + 标准答案 */}
                        {!isProgramming && Array.isArray(q.options) && (
                          <div className="mt-3 space-y-1.5">
                            {(q.options as { key: string; text: string }[]).map((opt) => {
                              const yourAnswer = ans?.content as unknown;
                              const isYour =
                                typeof yourAnswer === "string"
                                  ? yourAnswer === opt.key
                                  : Array.isArray(yourAnswer)
                                    ? yourAnswer.includes(opt.key)
                                    : false;
                              const correctKeys = (q.answer as string[] | string | null) ?? null;
                              const isCorrectKey = Array.isArray(correctKeys)
                                ? correctKeys.includes(opt.key)
                                : correctKeys === opt.key;
                              return (
                                <div
                                  key={opt.key}
                                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                                    isCorrectKey
                                      ? "border-success/30 bg-success-subtle/30 text-foreground"
                                      : "border-border bg-card text-muted-foreground"
                                  }`}
                                >
                                  {isCorrectKey ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                                  ) : (
                                    <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-border" />
                                  )}
                                  <span className="font-mono text-xs text-subtle-foreground">
                                    {opt.key}.
                                  </span>
                                  <span className="flex-1">{opt.text}</span>
                                  {isYour && (
                                    <Badge variant="primary" className="text-[10px]">
                                      你的答案
                                    </Badge>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* 编程题：评测结果 */}
                        {isProgramming && sub && (
                          <div className="mt-3 space-y-3">
                            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
                              <Code className="h-4 w-4 text-primary" />
                              <span>通过</span>
                              <span className="num font-medium">
                                {sub.passedCount}/{sub.totalCount}
                              </span>
                              {sub.maxTimeMs != null && (
                                <span className="ml-auto text-xs text-muted-foreground">
                                  最长 {sub.maxTimeMs} ms
                                </span>
                              )}
                            </div>
                            {sub.judgeCases.length > 0 && (
                              <div className="overflow-hidden rounded-lg border border-border">
                                <table className="w-full text-xs">
                                  <thead className="bg-muted/50 text-muted-foreground">
                                    <tr>
                                      <th className="px-3 py-2 text-left">用例</th>
                                      <th className="px-3 py-2 text-left">类型</th>
                                      <th className="px-3 py-2 text-left">状态</th>
                                      <th className="px-3 py-2 text-left">用时</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border">
                                    {sub.judgeCases.map((c) => (
                                      <tr key={c.testCase.order}>
                                        <td className="px-3 py-2 num">#{c.testCase.order}</td>
                                        <td className="px-3 py-2">
                                          {c.testCase.isSample ? (
                                            <Badge variant="default">示例</Badge>
                                          ) : (
                                            <Badge variant="warning">隐藏</Badge>
                                          )}
                                        </td>
                                        <td className="px-3 py-2">
                                          <Badge variant={c.status === "ACCEPTED" ? "success" : "danger"}>
                                            {c.status === "ACCEPTED" ? "通过" : "未通过"}
                                          </Badge>
                                        </td>
                                        <td className="px-3 py-2 num text-muted-foreground">
                                          {c.timeMs ?? "—"} ms
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}

                        {/* 编程题未评测（提交失败 / 还在评测） */}
                        {isProgramming && !sub && (
                          <div className="mt-3 rounded-lg border border-dashed border-border bg-muted/40 p-4 text-xs text-muted-foreground">
                            <ListChecks className="mr-1 inline h-3 w-3" />
                            本题无评测结果
                          </div>
                        )}

                        {/* 评语 */}
                        {ans?.comment && (
                          <div className="mt-3 rounded-lg border border-accent/30 bg-accent-subtle/40 p-3 text-xs">
                            <p className="font-medium text-accent">教师评语</p>
                            <p className="mt-1 text-foreground">{ans.comment}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </main>
    </>
  );
}