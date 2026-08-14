import { SCORE_BUCKETS } from "@/app/_charts/colors";

export type ExamAttemptForAnalysis = {
  finalScore: number | null;
  autoScore: number | null;
  manualScore: number | null;
  answers: Array<{
    questionId: string;
    autoScore: number | null;
    manualScore: number | null;
  }>;
};

export type ExamQuestionForAnalysis = {
  questionId: string;
  type: string;
  content: string;
  score: number;
  order: number;
};

export type ExamAnalytics = {
  participantCount: number;
  submittedCount: number;
  mean: number;
  median: number;
  max: number;
  min: number;
  stdDev: number;
  passRate: number; // 0..1
  /** 分数分布（10 分一段），长度 10 */
  distribution: number[];
  /** 每题分析 */
  perQuestion: Array<{
    questionId: string;
    type: string;
    content: string;
    fullScore: number;
    order: number;
    mean: number;
    scoreRate: number; // 0..1
    correctCount: number;
  }>;
};

/** 取该 attempt 的有效分数（GRADED 用 finalScore；未发布用 auto+manual 预估） */
function effectiveScore(a: ExamAttemptForAnalysis, totalScore: number): number {
  if (a.finalScore != null) return a.finalScore;
  const auto = a.autoScore ?? 0;
  const manual = a.manualScore ?? 0;
  return Math.max(0, Math.min(auto + manual, totalScore));
}

function percentileRate(score: number, totalScore: number): number {
  if (totalScore <= 0) return 0;
  return Math.max(0, Math.min(1, score / totalScore));
}

export function analyzeExam(
  attempts: ExamAttemptForAnalysis[],
  questions: ExamQuestionForAnalysis[],
  totalScore: number,
): ExamAnalytics {
  const submitted = attempts.filter(
    (a) =>
      a.finalScore != null ||
      a.autoScore != null ||
      a.manualScore != null ||
      a.answers.length > 0,
  );
  const scores = submitted.map((a) => effectiveScore(a, totalScore));

  const mean = scores.length ? scores.reduce((s, n) => s + n, 0) / scores.length : 0;
  const sorted = [...scores].sort((a, b) => a - b);
  const median =
    sorted.length === 0
      ? 0
      : sorted.length % 2 === 1
        ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  const max = sorted.length ? sorted[sorted.length - 1] : 0;
  const min = sorted.length ? sorted[0] : 0;
  const variance =
    scores.length > 1
      ? scores.reduce((s, n) => s + (n - mean) ** 2, 0) / scores.length
      : 0;
  const stdDev = Math.sqrt(variance);
  const passRate = scores.length
    ? scores.filter((s) => percentileRate(s, totalScore) >= 0.6).length / scores.length
    : 0;

  // 分布
  const distribution = SCORE_BUCKETS.map(() => 0);
  for (const s of scores) {
    const pct = totalScore > 0 ? (s / totalScore) * 100 : 0;
    const bucket = Math.min(9, Math.max(0, Math.floor(pct / 10)));
    distribution[bucket]++;
  }

  // 每题分析
  const perQuestion = questions.map((q) => {
    let sum = 0;
    let correctCount = 0;
    for (const a of submitted) {
      const ans = a.answers.find((x) => x.questionId === q.questionId);
      const s = ans
        ? (ans.autoScore ?? 0) + (ans.manualScore ?? 0)
        : 0;
      sum += s;
      if (s >= q.score) correctCount++;
    }
    const meanQ = submitted.length ? sum / submitted.length : 0;
    const scoreRate = q.score > 0 ? meanQ / q.score : 0;
    return {
      questionId: q.questionId,
      type: q.type,
      content: q.content,
      fullScore: q.score,
      order: q.order,
      mean: meanQ,
      scoreRate: Math.max(0, Math.min(1, scoreRate)),
      correctCount,
    };
  });

  return {
    participantCount: attempts.length,
    submittedCount: submitted.length,
    mean,
    median,
    max,
    min,
    stdDev,
    passRate,
    distribution,
    perQuestion,
  };
}

export function bucketLabel(index: number): string {
  return SCORE_BUCKETS[index] ?? "";
}