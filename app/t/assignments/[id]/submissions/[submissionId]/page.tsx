import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { MarkdownContent } from "@/components/markdown-content";
import { Topbar } from "@/components/shell/topbar";
import { formatDate } from "@/lib/utils";
import { CheckCircle2, ChevronLeft, Code, FileText, XCircle } from "lucide-react";
import { scoreAssignmentAnswers, scoreAssignmentProblem } from "@/lib/assignments/scoring";

export const metadata = { title: "学生作答" };

function displayAnswer(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => String(item ?? "")).join("；");
  if (value === null || value === undefined || value === "") return "未作答";
  return String(value);
}

export default async function AssignmentSubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string; submissionId: string }>;
}) {
  const { id, submissionId } = await params;
  const session = await auth();
  if (session?.user.role !== "TEACHER") redirect("/login?error=forbidden");

  const submission = await prisma.assignmentSubmission.findUnique({
    where: { id: submissionId },
    include: {
      student: {
        select: { id: true, name: true, studentNo: true, class: { select: { name: true } } },
      },
      assignment: {
        include: {
          course: {
            select: {
              title: true,
              teachers: { where: { teacherId: session.user.id }, select: { role: true } },
            },
          },
          questions: {
            orderBy: { order: "asc" },
            include: {
              question: { select: { type: true, content: true, options: true, answer: true } },
            },
          },
          problems: {
            orderBy: { order: "asc" },
            include: { problem: { select: { title: true, description: true } } },
          },
        },
      },
    },
  });
  if (!submission || submission.assignmentId !== id) notFound();
  const role = submission.assignment.course.teachers[0]?.role;
  if (role !== "OWNER" && role !== "ASSISTANT") {
    redirect(`/t/assignments/${id}?error=forbidden`);
  }

  const answers =
    submission.answers &&
    typeof submission.answers === "object" &&
    !Array.isArray(submission.answers)
      ? (submission.answers as Record<string, unknown>)
      : {};
  const programmingSubmissions = await prisma.submission.findMany({
    where: {
      contextType: "ASSIGNMENT",
      contextId: id,
      userId: submission.studentId,
      problemId: { in: submission.assignment.problems.map((item) => item.problemId) },
    },
    orderBy: { createdAt: "desc" },
    select: {
      problemId: true,
      code: true,
      status: true,
      score: true,
      passedCount: true,
      totalCount: true,
      maxTimeMs: true,
      judgeCases: {
        orderBy: { testCase: { order: "asc" } },
        select: {
          status: true,
          timeMs: true,
          testCase: { select: { order: true, isSample: true } },
        },
      },
    },
  });
  const latestByProblem = new Map<string, (typeof programmingSubmissions)[number]>();
  for (const item of programmingSubmissions) {
    if (!latestByProblem.has(item.problemId)) latestByProblem.set(item.problemId, item);
  }

  return (
    <>
      <Topbar
        crumbs={[
          { label: "作业", href: "/t/assignments" },
          { label: submission.assignment.title, href: `/t/assignments/${id}?tab=submissions` },
          { label: submission.student.name },
        ]}
      />
      <main className="min-w-0 flex-1 p-4 md:p-8">
        <div className="mx-auto flex max-w-[1024px] flex-col gap-6">
          <div>
            <Link
              href={`/t/assignments/${id}?tab=submissions`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              返回提交列表
            </Link>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  {submission.student.name}的作答
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {submission.student.class?.name ?? "未分班"} ·{" "}
                  {submission.student.studentNo ?? "无学号"} · 提交于{" "}
                  {submission.submittedAt ? formatDate(submission.submittedAt) : "尚未提交"}
                </p>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">系统自动得分</div>
                <div className="mt-1 text-3xl font-bold tabular-nums text-primary">
                  {submission.finalScore ?? submission.autoScore ?? 0}
                  <span className="ml-1 text-base font-normal text-muted-foreground">
                    / {submission.assignment.totalScore}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {submission.assignment.questions.map((item, index) => {
            const given = answers[item.questionId];
            const correct = scoreAssignmentAnswers([item], answers) === item.score;
            return (
              <Card key={item.questionId}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="font-medium">第 {index + 1} 题</span>
                      <Badge variant="default">
                        {item.question.type === "SINGLE_CHOICE" ? "选择题" : "填空题"}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">{item.score} 分</span>
                  </div>
                  <MarkdownContent content={item.question.content} className="mt-4" />
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                      <div className="mb-1 text-xs text-muted-foreground">学生答案</div>
                      {displayAnswer(given)}
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                      <div className="mb-1 text-xs text-muted-foreground">参考答案</div>
                      {displayAnswer(item.question.answer)}
                    </div>
                  </div>
                  <div
                    className={`mt-3 flex items-center gap-1.5 text-xs ${correct ? "text-success" : "text-danger"}`}
                  >
                    {correct ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5" />
                    )}
                    {correct ? "回答正确" : "回答错误"}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {submission.assignment.problems.map((item, index) => {
            const result = latestByProblem.get(item.problemId);
            return (
              <Card key={item.problemId}>
                <CardContent className="p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Code className="h-4 w-4 text-primary" />
                      <span className="font-medium">
                        编程题 {index + 1} · {item.problem.title}
                      </span>
                    </div>
                    <Badge variant={result?.status === "ACCEPTED" ? "success" : "default"}>
                      {result
                        ? `${result.passedCount}/${result.totalCount} 测试点 · ${scoreAssignmentProblem(result.passedCount, result.totalCount, item.score)}/${item.score} 分`
                        : "未提交"}
                    </Badge>
                  </div>
                  <MarkdownContent content={item.problem.description} className="mt-4" />
                  <div className="mt-4 text-xs font-medium text-muted-foreground">学生代码</div>
                  <pre className="mt-2 max-h-[520px] overflow-auto rounded-lg border border-border bg-muted p-4 font-mono text-sm leading-6">
                    {result?.code ?? "未提交代码"}
                  </pre>
                  {result && (
                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {result.judgeCases.map((judgeCase) => (
                        <div
                          key={`${judgeCase.testCase.order}-${judgeCase.status}`}
                          className="rounded-lg border border-border px-3 py-2 text-xs"
                        >
                          <div className="font-medium">测试点 {judgeCase.testCase.order + 1}</div>
                          <div
                            className={
                              judgeCase.status === "ACCEPTED"
                                ? "mt-1 text-success"
                                : "mt-1 text-danger"
                            }
                          >
                            {judgeCase.status === "ACCEPTED" ? "通过" : "未通过"} ·{" "}
                            {judgeCase.timeMs ?? 0} ms
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {submission.fileName && (
            <Card>
              <CardContent className="flex items-center justify-between gap-4 p-6">
                <div>
                  <div className="font-medium">补充附件</div>
                  <div className="mt-1 text-xs text-muted-foreground">附件不参与评分</div>
                </div>
                <Link
                  href={`/api/assignment-submissions/${submission.id}/attachment`}
                  className="text-sm text-primary hover:underline"
                >
                  下载 {submission.fileName}
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </>
  );
}
