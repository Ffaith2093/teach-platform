export function effectiveQuestionScore(answer: { autoScore: number | null; manualScore: number | null }): number {
  return answer.manualScore ?? answer.autoScore ?? 0;
}

export function finalExamScore(
  answers: Array<{ autoScore: number | null; manualScore: number | null }>,
  maxScore: number,
): number {
  return Math.max(0, Math.min(maxScore, answers.reduce((sum, answer) => sum + effectiveQuestionScore(answer), 0)));
}

export function scaledProblemScore(score: number, possible: number, allocated: number): number {
  return possible > 0 ? Math.max(0, Math.min(allocated, Math.round(score / possible * allocated))) : 0;
}
