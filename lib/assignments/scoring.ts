type ScorableQuestion = {
  questionId: string;
  score: number;
  question: { type: string; answer: unknown };
};

function normalized(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase();
}

export function scoreAssignmentAnswers(questions: ScorableQuestion[], rawAnswers: unknown): number {
  if (!rawAnswers || typeof rawAnswers !== "object" || Array.isArray(rawAnswers)) return 0;
  const answers = rawAnswers as Record<string, unknown>;
  return questions.reduce((total, item) => {
    const submitted = answers[item.questionId];
    if (item.question.type === "SINGLE_CHOICE") {
      return total + (normalized(submitted) === normalized(item.question.answer) ? item.score : 0);
    }
    const expected = Array.isArray(item.question.answer) ? item.question.answer : [item.question.answer];
    const actual = Array.isArray(submitted) ? submitted : [submitted];
    const correct = expected.length === actual.length
      && expected.every((value, index) => normalized(value) === normalized(actual[index]));
    return total + (correct ? item.score : 0);
  }, 0);
}
