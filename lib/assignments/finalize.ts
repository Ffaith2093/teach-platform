import { prisma } from "@/lib/prisma";

const UNFINISHED_JUDGE_STATUSES = new Set(["PENDING", "JUDGING", "SYSTEM_ERROR"]);

function hasAnswer(answers: Record<string, unknown>, questionId: string): boolean {
  const value = answers[questionId];
  if (Array.isArray(value)) return value.length > 0 && value.every((part) => String(part ?? "").trim());
  return String(value ?? "").trim().length > 0;
}

export async function finalizeAutomaticAssignment(
  assignmentId: string,
  studentId: string,
): Promise<boolean> {
  const [assignment, parent] = await Promise.all([
    prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: {
        allowAttachment: true,
        problems: { select: { problemId: true } },
        questions: { select: { questionId: true } },
      },
    }),
    prisma.assignmentSubmission.findUnique({
      where: { assignmentId_studentId: { assignmentId, studentId } },
      select: { id: true, answers: true, autoScore: true },
    }),
  ]);
  if (!assignment || !parent || assignment.allowAttachment) return false;

  const answers = parent.answers && typeof parent.answers === "object" && !Array.isArray(parent.answers)
    ? parent.answers as Record<string, unknown>
    : {};
  if (assignment.questions.some((question) => !hasAnswer(answers, question.questionId))) return false;

  for (const problem of assignment.problems) {
    const latest = await prisma.submission.findFirst({
      where: {
        contextType: "ASSIGNMENT",
        contextId: assignmentId,
        userId: studentId,
        problemId: problem.problemId,
      },
      orderBy: { createdAt: "desc" },
      select: { status: true },
    });
    if (!latest || UNFINISHED_JUDGE_STATUSES.has(latest.status)) return false;
  }

  await prisma.assignmentSubmission.update({
    where: { id: parent.id },
    data: {
      status: "GRADED",
      finalScore: parent.autoScore ?? 0,
      manualScore: null,
      gradedById: null,
      gradedAt: new Date(),
    },
  });
  return true;
}
