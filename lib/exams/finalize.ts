import { prisma } from "@/lib/prisma";

const UNFINISHED_JUDGE_STATUSES = ["PENDING", "JUDGING"] as const;

/** Finalize an automatically scored exam only after that student's class is closed. */
export async function finalizeAutomaticExamAttempt(attemptId: string): Promise<boolean> {
  const attempt = await prisma.examAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      examId: true,
      status: true,
      student: { select: { classId: true } },
      exam: { select: { totalScore: true } },
      answers: { select: { autoScore: true } },
    },
  });
  if (!attempt?.student.classId || attempt.status === "IN_PROGRESS") return false;

  const session = await prisma.examClassSession.findUnique({
    where: {
      examId_classId: { examId: attempt.examId, classId: attempt.student.classId },
    },
    select: { status: true },
  });
  if (session?.status !== "CLOSED") return false;

  const pending = await prisma.submission.count({
    where: {
      contextType: "EXAM",
      contextId: attemptId,
      status: { in: [...UNFINISHED_JUDGE_STATUSES] },
    },
  });
  if (pending > 0) {
    await prisma.examAttempt.updateMany({
      where: { id: attemptId, status: "SUBMITTED" },
      data: { status: "GRADING", finalScore: null },
    });
    return false;
  }

  const autoScore = Math.max(
    0,
    Math.min(
      attempt.exam.totalScore,
      attempt.answers.reduce((sum, answer) => sum + (answer.autoScore ?? 0), 0),
    ),
  );
  await prisma.examAttempt.update({
    where: { id: attemptId },
    data: {
      status: "GRADED",
      autoScore,
      manualScore: null,
      finalScore: autoScore,
    },
  });
  return true;
}
