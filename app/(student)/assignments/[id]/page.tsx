import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Topbar } from "@/components/shell/topbar";
import { formatDate } from "@/lib/utils";
import {
  ChevronLeft,
  Clock,
  FileText,
  AlertCircle,
  CheckCircle2,
  Code,
  ClipboardCheck,
} from "lucide-react";
import type { SubmissionStatus } from "@prisma/client";
import { ProblemSubmit } from "./_components/problem-submit";
import { scoreAssignmentProblem } from "@/lib/assignments/scoring";
import { AssignmentContentSubmit } from "./_components/assignment-content-submit";

export const metadata = { title: "作业详情" };

const STATUS_LABELS: Record<SubmissionStatus, { label: string; tone: "default" | "warning" | "success" | "accent" }> = {
  DRAFT: { label: "草稿", tone: "default" },
  SUBMITTED: { label: "已提交", tone: "warning" },
  GRADED: { label: "已批改", tone: "success" },
  RETURNED: { label: "已退回", tone: "accent" },
};

export default async function StudentAssignmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userId = session!.user.id;

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { classId: true },
  });
  if (!me?.classId) redirect("/dashboard");

  const assignment = await prisma.assignment.findUnique({
    where: { id },
    include: {
      course: {
        select: {
          id: true,
          title: true,
          classes: { where: { classId: me.classId }, select: { id: true } },
        },
      },
      problems: {
        orderBy: { order: "asc" },
        include: {
          problem: {
            select: {
              id: true,
              title: true,
              description: true,
              difficulty: true,
              tags: true,
              starterCode: true,
              timeLimitMs: true,
              memoryLimitMb: true,
              testCases: {
                orderBy: { order: "asc" },
                select: { id: true, input: true, expected: true, isSample: true },
              },
            },
          },
        },
      },
      questions: {
        orderBy: { order: "asc" },
        include: { question: { select: { id: true, content: true, type: true, options: true, answer: true } } },
      },
    },
  });
  if (!assignment) notFound();

  // 权限：必须 published + 学生班级在该课程的班级列表里
  if (!assignment.publishedAt) notFound();
  if (assignment.course.classes.length === 0) {
    redirect("/assignments?error=forbidden");
  }

  const now = new Date();
  const isOverdue = assignment.dueAt < now;

  // 学生本人的提交聚合
  const mySub = await prisma.assignmentSubmission.findUnique({
    where: { assignmentId_studentId: { assignmentId: id, studentId: userId } },
    select: {
      id: true,
      status: true,
      autoScore: true,
      manualScore: true,
      finalScore: true,
      feedback: true,
      submittedAt: true,
      gradedAt: true,
      answers: true,
      textContent: true,
      fileName: true,
    },
  });

  // 该学生每道题的最近一次提交
  const allMySubs = await prisma.submission.findMany({
    where: {
      userId,
      contextType: "ASSIGNMENT",
      contextId: id,
    },
    orderBy: { createdAt: "desc" },
    include: {
      judgeCases: {
        include: {
          testCase: { select: { isSample: true, order: true } },
        },
      },
    },
  });

  // 取每题最新
  const latestByProblem = new Map<
    string,
    { code: string; status: string; passedCount: number; totalCount: number; score: number; cases: Array<{ order: number; isSample: boolean; status: string; timeMs: number; actualOutput?: string; errorMsg?: string }> }
  >();
  for (const s of allMySubs) {
    if (latestByProblem.has(s.problemId)) continue;
    latestByProblem.set(s.problemId, {
      code: s.code,
      status: s.status,
      passedCount: s.passedCount,
      totalCount: s.totalCount,
      score: s.score,
      cases: s.judgeCases
        .sort((a, b) => a.testCase.order - b.testCase.order)
        .map((jc, idx) => ({
          order: idx,
          isSample: jc.testCase.isSample,
          status: jc.status,
          timeMs: jc.timeMs ?? 0,
          actualOutput: jc.testCase.isSample ? jc.actualOutput ?? undefined : undefined,
          errorMsg:
            s.errorMsg && idx === 0
              ? s.errorMsg.slice(0, 2000)
              : jc.status === "RUNTIME_ERROR" || jc.status === "COMPILE_ERROR" || jc.status === "TLE" || jc.status === "MLE"
                ? (s.errorMsg?.slice(0, 2000) ?? "")
                : undefined,
        })),
    });
  }

  // 题目总数 + 自动分累计
  const problemCount = assignment.problems.length;
  const submittedProblemCount = latestByProblem.size;

  // 当前 Submission 的 autoScore 是实时累加的
  const myTotalAuto = mySub?.autoScore ?? 0;

  const stat = (() => {
    if (mySub?.status === "GRADED") {
      return {
        label: "最终成绩",
        value: `${mySub.finalScore ?? 0} / ${assignment.totalScore}`,
        tone: "success" as const,
      };
    }
    if (mySub) {
      return {
        label: "自动评分",
        value: `${myTotalAuto} / ${assignment.totalScore}`,
        tone: "warning" as const,
      };
    }
    if (isOverdue) {
      return {
        label: "已逾期",
        value: "未提交",
        tone: "danger" as const,
      };
    }
    return {
      label: "待开始",
      value: "未提交",
      tone: "default" as const,
    };
  })();

  return (
    <>
      <Topbar
        crumbs={[
          { label: "我的作业", href: "/assignments" },
          { label: assignment.title },
        ]}
      />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
          <div>
            <Link
              href="/assignments"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-3 w-3" />
              返回我的作业
            </Link>
            <div className="mt-2 flex items-end justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight">{assignment.title}</h1>
                  {mySub ? (
                    <Badge variant={STATUS_LABELS[mySub.status].tone}>
                      {STATUS_LABELS[mySub.status].label}
                    </Badge>
                  ) : isOverdue ? (
                    <Badge variant="default">已逾期</Badge>
                  ) : (
                    <Badge variant="success">进行中</Badge>
                  )}
                  <span className="text-sm text-muted-foreground">{assignment.course.title}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    截止 <span className="num">{formatDate(assignment.dueAt)}</span>
                  </span>
                  <span>·</span>
                  <span>
                    {assignment.allowLate ? (
                      <span className="text-warning">
                        允许迟交（提交后扣 {assignment.latePenalty}%）
                      </span>
                    ) : (
                      <span className="text-muted-foreground">不允许迟交</span>
                    )}
                  </span>
                  <span>·</span>
                  <span className="num">
                    编程题已完成 {submittedProblemCount} / {problemCount}
                  </span>
                </div>
              </div>
            </div>
            {assignment.description.trim() && (
              <p className="mt-3 whitespace-pre-line rounded-lg border border-border bg-muted/40 p-3 text-sm text-foreground">
                {assignment.description}
              </p>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">{stat.label}</div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span
                    className={`text-3xl font-bold tracking-tight num ${
                      stat.tone === "success"
                        ? "text-success"
                        : stat.tone === "danger"
                          ? "text-danger"
                          : stat.tone === "warning"
                            ? "text-warning"
                            : "text-muted-foreground"
                    }`}
                  >
                    {stat.value}
                  </span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">题目数</div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-bold tracking-tight num">{problemCount + assignment.questions.length}</span>
                  <span className="text-sm text-muted-foreground">题</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">总分</div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-bold tracking-tight num">{assignment.totalScore}</span>
                  <span className="text-sm text-muted-foreground">分</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">剩余时间</div>
                <div className="mt-3 flex items-baseline gap-1">
                  {(() => {
                    const ms = assignment.dueAt.getTime() - now.getTime();
                    if (ms < 0)
                      return (
                        <>
                          <span className="text-3xl font-bold tracking-tight text-danger num">
                            已截止
                          </span>
                        </>
                      );
                    const days = Math.floor(ms / 86400000);
                    const hours = Math.floor((ms % 86400000) / 3600000);
                    return (
                      <>
                        <span className="text-3xl font-bold tracking-tight num">
                          {days > 0 ? `${days}` : hours}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {days > 0 ? "天" : "小时"}
                          {days === 0 && ` ${Math.floor((ms % 3600000) / 60000)} 分`}
                        </span>
                      </>
                    );
                  })()}
                </div>
              </CardContent>
            </Card>
          </div>

          {mySub?.feedback && (
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">教师反馈</span>
                </div>
                <p className="mt-2 whitespace-pre-line text-sm text-foreground">
                  {mySub.feedback}
                </p>
              </CardContent>
            </Card>
          )}

          {(assignment.questions.length > 0 || assignment.allowAttachment) && (
            <AssignmentContentSubmit
              assignmentId={assignment.id}
              questions={assignment.questions.map((item) => ({
                id: item.questionId,
                content: item.question.content,
                type: item.question.type,
                options: Array.isArray(item.question.options) ? item.question.options as Array<{ key: string; text: string }> : [],
                blankCount: Array.isArray(item.question.answer) ? Math.max(1, item.question.answer.length) : 1,
                score: item.score,
              }))}
              allowAttachment={assignment.allowAttachment}
              allowedExtensions={assignment.allowedFileExtensions}
              maxFileSizeMb={assignment.maxFileSizeMb}
              initialAnswers={mySub?.answers && typeof mySub.answers === "object" && !Array.isArray(mySub.answers) ? mySub.answers as Record<string, unknown> : {}}
              existingFileName={mySub?.fileName ?? null}
            />
          )}

          {assignment.problems.length === 0 && assignment.questions.length === 0 && !assignment.allowAttachment ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Code className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">本作业未挂载编程题</p>
                  <p className="mt-1 text-xs text-muted-foreground">请等待教师完善作业内容</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {assignment.problems.map((ap, idx) => {
                const p = ap.problem;
                const lr = latestByProblem.get(p.id);
                const sampleCases = p.testCases
                  .filter((tc) => tc.isSample)
                  .map((tc) => ({ input: tc.input, expected: tc.expected }));
                return (
                  <ProblemSubmit
                    key={p.id}
                    assignmentId={assignment.id}
                    myTotalScore={myTotalAuto}
                    totalScore={assignment.totalScore}
                    problem={{
                      id: p.id,
                      title: p.title,
                      description: p.description,
                      difficulty: p.difficulty,
                      tags: p.tags,
                      starterCode: p.starterCode,
                      testCaseCount: p.testCases.length,
                      timeLimitMs: p.timeLimitMs,
                      memoryLimitMb: p.memoryLimitMb,
                      samples: sampleCases,
                      score: ap.score,
                    }}
                    lastCode={lr?.code ?? null}
                    lastResult={
                      lr
                        ? {
                            status: lr.status,
                            passedCount: lr.passedCount,
                            totalCount: lr.totalCount,
                            autoScore: scoreAssignmentProblem(
                              lr.passedCount,
                              lr.totalCount,
                              ap.score,
                            ),
                            cases: lr.cases,
                          }
                        : null
                    }
                  />
                );
              })}
            </div>
          )}

          {assignment.problems.length > 0 && submittedProblemCount < problemCount && (
            <div className="rounded-xl border border-warning/40 bg-warning-subtle/40 p-4 text-xs text-warning">
              <AlertCircle className="mr-1.5 inline h-3.5 w-3.5" />
              您还有 {problemCount - submittedProblemCount} 道题未提交。
            </div>
          )}
        </div>
      </main>
    </>
  );
}
