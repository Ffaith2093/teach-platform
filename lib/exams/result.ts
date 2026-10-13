export function orderAttemptQuestions<T extends { questionId: string }>(
  questions: readonly T[],
  questionIds: readonly string[],
): T[] {
  const byId = new Map(questions.map((question) => [question.questionId, question]));
  return questionIds
    .map((questionId) => byId.get(questionId))
    .filter((question): question is T => question !== undefined);
}
