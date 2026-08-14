import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/shell/topbar";
import { AttemptClient } from "./_components/attempt-client";
import type { Difficulty, QuestionType } from "@prisma/client";

export const metadata = { title: "作答中" };

export default async function AttemptPage({
  params,
}: {
  params: Promise<{ id: string; attemptId: string }>;
}) {
  const { id, attemptId } = await params;
  const session = await auth();
  const userId = session!.user.id;

  const attempt = await prisma.examAttempt.findUnique({
    where: { id: attemptId },
    include: {
      exam: { select: { id: true, title: true, totalScore: true, shuffleOption: true } },
      answers: { select: { questionId: true, content: true } },
    },
  });
  if (!attempt || attempt.examId !== id) notFound();
  if (attempt.studentId !== userId) redirect("/exams");
  if (attempt.status !== "IN_PROGRESS") redirect(`/exams/${id}`);

  const examQuestions = await prisma.examQuestion.findMany({
    where: { examId: id },
    include: {
      question: {
        select: {
          id: true,
          type: true,
          content: true,
          options: true,
          difficulty: true,
          problem: {
            select: { id: true, title: true, description: true, starterCode: true },
          },
        },
      },
    },
  });
  const byId = new Map(examQuestions.map((eq) => [eq.questionId, eq]));

  // 按 attempt 固化的顺序排列
  const ordered = attempt.questionIds
    .map((qid) => byId.get(qid))
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const answerByQid = new Map(attempt.answers.map((a) => [a.questionId, a.content]));

  const questions = ordered.map((eq, i) => ({
    index: i + 1,
    questionId: eq.questionId,
    type: eq.question.type as QuestionType,
    content: eq.question.content,
    difficulty: eq.question.difficulty as Difficulty,
    score: eq.score,
    options: (eq.question.options as { key: string; text: string }[] | null) ?? null,
    problem: eq.question.problem
      ? {
          id: eq.question.problem.id,
          title: eq.question.problem.title,
          description: eq.question.problem.description,
          starterCode: eq.question.problem.starterCode ?? "",
        }
      : null,
    saved: (answerByQid.get(eq.questionId) ?? null) as unknown,
  }));

  return (
    <>
      <Topbar crumbs={[{ label: "我的考试", href: "/exams" }, { label: attempt.exam.title }]} />
      <AttemptClient
        attemptId={attempt.id}
        examTitle={attempt.exam.title}
        totalScore={attempt.exam.totalScore}
        deadlineAt={attempt.deadlineAt.toISOString()}
        questions={questions}
      />
    </>
  );
}
