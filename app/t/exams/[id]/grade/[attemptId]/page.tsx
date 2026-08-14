import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Topbar } from "@/components/shell/topbar";
import { formatDate, relativeTime } from "@/lib/utils";
import {
  ChevronLeft,
  Clock,
  CheckCircle2,
  AlertCircle,
  User,
} from "lucide-react";
import { GradeAttemptForm } from "./_components/grade-attempt-form";
import { GradeHeaderActions } from "./_components/grade-header-actions";
import type { AttemptStatus, Difficulty, QuestionType } from "@prisma/client";

export const metadata = { title: "批改学生答卷" };

export default async function GradeAttemptPage({
  params,
}: {
  params: Promise<{ id: string; attemptId: string }>;
}) {
  const { id, attemptId } = await params;
  const session = await auth();
  const userId = session!.user.id;
  if (session!.user.role !== "TEACHER") redirect("/login?error=forbidden");

  const exam = await prisma.exam.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      totalScore: true,
      course: {
        select: {
          teachers: { where: { teacherId: userId }, select: { role: true } },
        },
      },
    },
  });
  if (!exam) notFound();
  const myRole = exam.course.teachers[0]?.role;
  if (!myRole || (myRole !== "OWNER" && myRole !== "ASSISTANT")) {
    redirect(`/t/exams/${id}/grade?error=forbidden`);
  }
  const isOwner = myRole === "OWNER";

  const attempt = await prisma.examAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      examId: true,
      status: true,
      autoScore: true,
      manualScore: true,
      finalScore: true,
      startedAt: true,
      submittedAt: true,
      deadlineAt: true,
      isAutoSubmit: true,
      questionIds: true,
      student: {
        select: {
          id: true,
          name: true,
          studentNo: true,
          class: { select: { name: true } },
        },
      },
    },
  });
  if (!attempt || attempt.examId !== id) notFound();
  if (attempt.status === "IN_PROGRESS") {
    redirect(`/t/exams/${id}/grade`);
  }

  const examQuestions = await prisma.examQuestion.findMany({
    where: { examId: id },
    include: {
      question: {
        select: {
          id: true,
          type: true,
          content: true,
          options: true,
          problem: { select: { title: true, description: true, starterCode: true } },
        },
      },
    },
  });
  const eqById = new Map(examQuestions.map((eq) => [eq.questionId, eq]));

  const answers = await prisma.answer.findMany({
    where: { attemptId },
    select: {
      id: true,
      questionId: true,
      content: true,
      autoScore: true,
      manualScore: true,
      comment: true,
    },
  });
  const ansByQid = new Map(answers.map((a) => [a.questionId, a]));

  const questions = attempt.questionIds
    .map((qid, i) => {
      const eq = eqById.get(qid);
      if (!eq) return null;
      const ans = ansByQid.get(qid);
      return {
        index: i + 1,
        questionId: eq.questionId,
        type: eq.question.type as QuestionType,
        content: eq.question.content,
        score: eq.score,
        options: (eq.question.options as { key: string; text: string }[] | null) ?? null,
        problem: eq.question.problem
          ? {
              title: eq.question.problem.title,
              description: eq.question.problem.description,
              starterCode: eq.question.problem.starterCode ?? "",
            }
          : null,
        autoScore: ans?.autoScore ?? null,
        manualScore: ans?.manualScore ?? null,
        comment: ans?.comment ?? null,
        answerContent: ans?.content ?? null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const isManual = (q: { type: QuestionType }) => q.type === "PROGRAMMING";

  return (
    <>
      <Topbar
        crumbs={[
          { label: "我的试卷", href: "/t/exams" },
          { label: exam.title, href: `/t/exams/${id}` },
          { label: "批改", href: `/t/exams/${id}/grade` },
          { label: attempt.student.name },
        ]}
      />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[980px] flex-col gap-6">
          <div>
            <Link
              href={`/t/exams/${id}/grade`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-3 w-3" />
              返回批改列表
            </Link>
            <div className="mt-2 flex items-end justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
                    <User className="h-5 w-5 text-muted-foreground" />
                    {attempt.student.name}
                  </h1>
                  <span className="num text-xs text-muted-foreground">
                    {attempt.student.studentNo ?? "—"}
                  </span>
                  {attempt.student.class && (
                    <Badge variant="default">{attempt.student.class.name}</Badge>
                  )}
                  <StatusBadge status={attempt.status} />
                  {attempt.isAutoSubmit && <Badge variant="warning">超时自动交卷</Badge>}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    提交{" "}
                    <span className="num">
                      {attempt.submittedAt ? formatDate(attempt.submittedAt) : "—"}
                    </span>
                    {attempt.submittedAt && `（${relativeTime(attempt.submittedAt)}）`}
                  </span>
                  <span>·</span>
                  <span>
                    截止 <span className="num">{formatDate(attempt.deadlineAt)}</span>
                  </span>
                  <span>·</span>
                  <span className="num">{questions.length} 题</span>
                </div>
              </div>
              <GradeHeaderActions
                examId={id}
                attemptId={attemptId}
                status={attempt.status}
                isOwner={isOwner}
              />
            </div>
          </div>

          <GradeAttemptForm
            attemptId={attemptId}
            examId={id}
            totalScore={exam.totalScore}
            questions={questions.map((q) => ({
              ...q,
              isManual: isManual(q),
            }))}
          />
        </div>
      </main>
    </>
  );
}

function StatusBadge({ status }: { status: AttemptStatus }) {
  switch (status) {
    case "SUBMITTED":
      return <Badge variant="default">已交卷</Badge>;
    case "GRADING":
      return <Badge variant="warning">批改中</Badge>;
    case "GRADED":
      return <Badge variant="success">已发布</Badge>;
    case "IN_PROGRESS":
      return <Badge variant="warning">作答中</Badge>;
  }
}