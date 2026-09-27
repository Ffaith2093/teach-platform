import { SCORE_BUCKETS } from "@/app/_charts/colors";

export type ExamAttemptForAnalysis = {
  id?: string;
  studentId?: string;
  studentName?: string;
  submittedAt?: Date | string | null;
  finalScore: number | null;
  autoScore: number | null;
  manualScore: number | null;
  questionIds?: string[];
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

export type ExamPerformers = {
  studentId: string;
  studentName: string;
  submittedAt: Date | string | null;
  score: number;
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
    /**
     * 区分度：高分 27% 组与低分 27% 组在该题的得分率之差。
     * 取值 [-1, 1]：≥0.4 优秀 / 0.2-0.4 良好 / <0.2 较差（题过易/过难/无区分力）。
     * 样本不足（<4 人）时为 null。
     */
    discrimination: number | null;
  }>;
  /** 前 5 名（按 effective score 降序） */
  topPerformers: ExamPerformers[];
  /** 后 5 名（按 effective score 升序） */
  bottomPerformers: ExamPerformers[];
};

/** 取该 attempt 的有效分数（GRADED 用 finalScore；未发布用 auto+manual 预估） */
function effectiveScore(a: ExamAttemptForAnalysis, totalScore: number): number {
  if (a.finalScore != null) return a.finalScore;
  return Math.max(0, Math.min(a.answers.reduce((sum, answer) => sum + (answer.manualScore ?? answer.autoScore ?? 0), 0), totalScore));
}

function percentileRate(score: number, totalScore: number): number {
  if (totalScore <= 0) return 0;
  return Math.max(0, Math.min(1, score / totalScore));
}

/** 该组在某题的得分率（sum/count/fullScore），count=0 时返 0 */
function groupScoreRate(
  group: ExamAttemptForAnalysis[],
  questionId: string,
  fullScore: number,
): number {
  if (group.length === 0 || fullScore <= 0) return 0;
  let sum = 0;
  let assigned = 0;
  for (const a of group) {
    if (a.questionIds && !a.questionIds.includes(questionId)) continue;
    assigned++;
    const ans = a.answers.find((x) => x.questionId === questionId);
    if (ans) sum += ans.manualScore ?? ans.autoScore ?? 0;
    // 未作答计 0
  }
  return assigned ? sum / (assigned * fullScore) : 0;
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

  // ===== 全局统计 =====
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

  // ===== 分布 =====
  const distribution = SCORE_BUCKETS.map(() => 0);
  for (const s of scores) {
    const pct = totalScore > 0 ? (s / totalScore) * 100 : 0;
    const bucket = Math.min(9, Math.max(0, Math.floor(pct / 10)));
    distribution[bucket]++;
  }

  // ===== 区分度（高分 / 低分 27% 组） =====
  // 仅当 ≥4 人有成绩时计算；班级太小时无统计意义
  const N = submitted.length;
  let highGroup: ExamAttemptForAnalysis[] = [];
  let lowGroup: ExamAttemptForAnalysis[] = [];
  if (N >= 4) {
    const groupSize = Math.max(1, Math.ceil(N * 0.27));
    const sortedByScoreDesc = [...submitted].sort(
      (a, b) => effectiveScore(b, totalScore) - effectiveScore(a, totalScore),
    );
    highGroup = sortedByScoreDesc.slice(0, groupSize);
    lowGroup = sortedByScoreDesc.slice(-groupSize);
  }

  // ===== 每题分析 =====
  const perQuestion = questions.map((q) => {
    let sum = 0;
    let correctCount = 0;
    let assigned = 0;
    for (const a of submitted) {
      if (a.questionIds && !a.questionIds.includes(q.questionId)) continue;
      assigned++;
      const ans = a.answers.find((x) => x.questionId === q.questionId);
      const s = ans ? (ans.manualScore ?? ans.autoScore ?? 0) : 0;
      sum += s;
      if (s >= q.score) correctCount++;
    }
    const meanQ = assigned ? sum / assigned : 0;
    const scoreRate = q.score > 0 ? meanQ / q.score : 0;

    const discrimination =
      highGroup.length > 0 && lowGroup.length > 0 && q.score > 0
        ? groupScoreRate(highGroup, q.questionId, q.score) -
          groupScoreRate(lowGroup, q.questionId, q.score)
        : null;

    return {
      questionId: q.questionId,
      type: q.type,
      content: q.content,
      fullScore: q.score,
      order: q.order,
      mean: meanQ,
      scoreRate: Math.max(0, Math.min(1, scoreRate)),
      correctCount,
      discrimination,
    };
  });

  // ===== TOP / BOTTOM =====
  // 按 effective score 排序；有学生信息的 entry 才进入榜单
  type WithStudent = ExamAttemptForAnalysis & {
    id: string;
    studentId: string;
    studentName: string;
  };
  const withStudent = submitted.filter(
    (a): a is WithStudent => Boolean(a.id && a.studentId && a.studentName),
  );
  const ranked = withStudent
    .map<ExamPerformers>((a) => ({
      studentId: a.studentId,
      studentName: a.studentName,
      submittedAt: a.submittedAt ?? null,
      score: effectiveScore(a, totalScore),
    }))
    .sort((a, b) => b.score - a.score);

  const topPerformers: ExamPerformers[] = ranked.slice(0, 5);
  const bottomPerformers: ExamPerformers[] = ranked.slice(-5).reverse();

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
    topPerformers,
    bottomPerformers,
  };
}

export function bucketLabel(index: number): string {
  return SCORE_BUCKETS[index] ?? "";
}
