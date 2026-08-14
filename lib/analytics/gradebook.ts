// 班级成绩单矩阵聚合
// 输入：班级学生 + 一组作业 / 试卷 + 对应的提交 / 尝试
// 输出：students × columns 矩阵 + 班级平均

export type GradebookStudent = {
  id: string;
  name: string;
  studentNo: string | null;
};

export type GradebookColumn = {
  id: string;
  title: string;
  totalScore: number;
  /** 用于排序 / 表头展示的时间戳（作业 dueAt / 试卷 openAt） */
  at: Date;
  kind: "assignment" | "exam";
};

export type GradebookCellValue = {
  /** null = 未提交；非 null = 已提交（含 0 分） */
  score: number | null;
  status: "NOT_SUBMITTED" | "SUBMITTED" | "GRADED";
};

export type GradebookRow = {
  student: GradebookStudent;
  /** key = column id */
  cells: Map<string, GradebookCellValue>;
  /** 平均分（仅算已提交），无提交则 null */
  averageScore: number | null;
};

export type Gradebook = {
  rows: GradebookRow[];
  columns: GradebookColumn[];
  /** 班级平均：key = column id；无提交列返回 null */
  classAverage: Map<string, number | null>;
  /** 全员在「已提交」列上的班级平均（用于汇总行显示） */
  overallAverage: number | null;
};

export type AssignmentSubmissionForGradebook = {
  assignmentId: string;
  studentId: string;
  finalScore: number | null;
  manualScore: number | null;
  autoScore: number | null;
  status: "DRAFT" | "SUBMITTED" | "GRADED" | "RETURNED";
};

export type ExamAttemptForGradebook = {
  examId: string;
  studentId: string;
  finalScore: number | null;
  autoScore: number | null;
  manualScore: number | null;
  status: "IN_PROGRESS" | "SUBMITTED" | "GRADING" | "GRADED";
};

export function effectiveAssignmentScore(s: AssignmentSubmissionForGradebook): number | null {
  if (s.finalScore != null) return s.finalScore;
  if (s.autoScore != null || s.manualScore != null) {
    return (s.autoScore ?? 0) + (s.manualScore ?? 0);
  }
  return null;
}

export function effectiveExamScore(s: ExamAttemptForGradebook, totalScore: number): number | null {
  if (s.finalScore != null) return s.finalScore;
  if (s.autoScore != null || s.manualScore != null) {
    return Math.max(0, Math.min((s.autoScore ?? 0) + (s.manualScore ?? 0), totalScore));
  }
  return null;
}

function cellForStatus(score: number | null, status: string): GradebookCellValue {
  // GRADED（已批改且有 finalScore） / SUBMITTED（仅提交未批） / NOT_SUBMITTED
  const hasScore = score != null;
  if (!hasScore && status === "DRAFT") return { score: null, status: "NOT_SUBMITTED" };
  if (!hasScore) return { score: null, status: "NOT_SUBMITTED" };
  if (status === "GRADED" || status === "RETURNED") return { score, status: "GRADED" };
  return { score, status: "SUBMITTED" };
}

export function buildAssignmentGradebook(
  students: GradebookStudent[],
  assignments: Array<{
    id: string;
    title: string;
    totalScore: number;
    dueAt: Date;
  }>,
  submissions: AssignmentSubmissionForGradebook[],
): Gradebook {
  const columns: GradebookColumn[] = assignments.map((a) => ({
    id: a.id,
    title: a.title,
    totalScore: a.totalScore,
    at: a.dueAt,
    kind: "assignment",
  }));

  const subMap = new Map<string, AssignmentSubmissionForGradebook>();
  for (const s of submissions) {
    subMap.set(`${s.assignmentId}:${s.studentId}`, s);
  }

  const rows: GradebookRow[] = students.map((student) => {
    const cells = new Map<string, GradebookCellValue>();
    let sum = 0;
    let count = 0;
    for (const col of columns) {
      const sub = subMap.get(`${col.id}:${student.id}`);
      if (!sub) {
        cells.set(col.id, { score: null, status: "NOT_SUBMITTED" });
        continue;
      }
      const score = effectiveAssignmentScore(sub);
      const cell = cellForStatus(score, sub.status);
      cells.set(col.id, cell);
      if (cell.score != null) {
        sum += cell.score;
        count++;
      }
    }
    return {
      student,
      cells,
      averageScore: count > 0 ? sum / count : null,
    };
  });

  const classAverage = new Map<string, number | null>();
  let overallSum = 0;
  let overallCount = 0;
  for (const col of columns) {
    let colSum = 0;
    let colCount = 0;
    for (const row of rows) {
      const cell = row.cells.get(col.id);
      if (cell && cell.score != null) {
        colSum += cell.score;
        colCount++;
      }
    }
    const avg = colCount > 0 ? colSum / colCount : null;
    classAverage.set(col.id, avg);
    if (avg != null) {
      overallSum += avg;
      overallCount++;
    }
  }
  const overallAverage = overallCount > 0 ? overallSum / overallCount : null;

  return {
    rows,
    columns,
    classAverage,
    overallAverage,
  };
}

export function buildExamGradebook(
  students: GradebookStudent[],
  exams: Array<{
    id: string;
    title: string;
    totalScore: number;
    openAt: Date;
  }>,
  attempts: ExamAttemptForGradebook[],
): Gradebook {
  const columns: GradebookColumn[] = exams.map((e) => ({
    id: e.id,
    title: e.title,
    totalScore: e.totalScore,
    at: e.openAt,
    kind: "exam",
  }));

  const attMap = new Map<string, ExamAttemptForGradebook>();
  for (const a of attempts) {
    attMap.set(`${a.examId}:${a.studentId}`, a);
  }

  const rows: GradebookRow[] = students.map((student) => {
    const cells = new Map<string, GradebookCellValue>();
    let sum = 0;
    let count = 0;
    for (const col of columns) {
      const att = attMap.get(`${col.id}:${student.id}`);
      if (!att || att.status === "IN_PROGRESS") {
        cells.set(col.id, { score: null, status: "NOT_SUBMITTED" });
        continue;
      }
      const score = effectiveExamScore(att, col.totalScore);
      const cell = cellForStatus(score, att.status);
      cells.set(col.id, cell);
      if (cell.score != null) {
        sum += cell.score;
        count++;
      }
    }
    return {
      student,
      cells,
      averageScore: count > 0 ? sum / count : null,
    };
  });

  const classAverage = new Map<string, number | null>();
  let overallSum = 0;
  let overallCount = 0;
  for (const col of columns) {
    let colSum = 0;
    let colCount = 0;
    for (const row of rows) {
      const cell = row.cells.get(col.id);
      if (cell && cell.score != null) {
        colSum += cell.score;
        colCount++;
      }
    }
    const avg = colCount > 0 ? colSum / colCount : null;
    classAverage.set(col.id, avg);
    if (avg != null) {
      overallSum += avg;
      overallCount++;
    }
  }
  const overallAverage = overallCount > 0 ? overallSum / overallCount : null;

  return {
    rows,
    columns,
    classAverage,
    overallAverage,
  };
}