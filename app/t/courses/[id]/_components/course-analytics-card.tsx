import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, FileText, GraduationCap } from "lucide-react";
import { buildAssignmentGradebook, buildExamGradebook } from "@/lib/analytics/gradebook";
import { formatDate } from "@/lib/utils";

type StudentLite = { id: string; name: string; studentNo: string | null };

type AssignmentLite = {
  id: string;
  title: string;
  totalScore: number;
  dueAt: Date;
  status: "PUBLISHED" | "DRAFT";
};

type ExamLite = {
  id: string;
  title: string;
  totalScore: number;
  openAt: Date;
  status: "PUBLISHED" | "DRAFT" | "CLOSED";
};

export function CourseAnalyticsCard({
  students,
  assignments,
  examList,
  assignmentSubs,
  examAttempts,
}: {
  students: StudentLite[];
  assignments: AssignmentLite[];
  examList: ExamLite[];
  assignmentSubs: Array<{
    assignmentId: string;
    studentId: string;
    finalScore: number | null;
    autoScore: number | null;
    manualScore: number | null;
    status: "DRAFT" | "SUBMITTED" | "GRADED" | "RETURNED";
  }>;
  examAttempts: Array<{
    examId: string;
    studentId: string;
    finalScore: number | null;
    autoScore: number | null;
    manualScore: number | null;
    status: "IN_PROGRESS" | "SUBMITTED" | "GRADING" | "GRADED";
  }>;
}) {
  // 仅纳入已发布的评估
  const publishedAssignments = assignments.filter((a) => a.status === "PUBLISHED");
  const publishedExams = examList.filter(
    (e) => e.status === "PUBLISHED" || e.status === "CLOSED",
  );

  if (publishedAssignments.length === 0 && publishedExams.length === 0) {
    return null;
  }

  const assignGb =
    publishedAssignments.length === 0
      ? null
      : buildAssignmentGradebook(
          students,
          publishedAssignments.map((a) => ({
            id: a.id,
            title: a.title,
            totalScore: a.totalScore,
            dueAt: a.dueAt,
          })),
          assignmentSubs,
        );
  const examGb =
    publishedExams.length === 0
      ? null
      : buildExamGradebook(
          students,
          publishedExams.map((e) => ({
            id: e.id,
            title: e.title,
            totalScore: e.totalScore,
            openAt: e.openAt,
          })),
          examAttempts,
        );

  const totalStudents = students.length;

  // 单列 % 均分（百分比 = colAvg / colTotalScore × 100）
  const computePctByCol = (
    gb: NonNullable<typeof assignGb> | NonNullable<typeof examGb>,
    cols: Array<{ id: string; totalScore: number }>,
  ): Map<string, number | null> => {
    const map = new Map<string, number | null>();
    for (const c of cols) {
      const raw = gb.classAverage.get(c.id);
      map.set(c.id, raw == null ? null : (raw / (c.totalScore || 1)) * 100);
    }
    return map;
  };

  const assignAvgPctByCol = assignGb
    ? computePctByCol(assignGb, publishedAssignments)
    : new Map<string, number | null>();
  const examAvgPctByCol = examGb
    ? computePctByCol(examGb, publishedExams)
    : new Map<string, number | null>();

  // 整体 % 均分（= 各列 % 均分的平均）
  const overallFromMap = (m: Map<string, number | null>): number | null => {
    let sum = 0;
    let count = 0;
    for (const v of m.values()) {
      if (v != null) {
        sum += v;
        count++;
      }
    }
    return count > 0 ? sum / count : null;
  };
  const overallAssignPct = overallFromMap(assignAvgPctByCol);
  const overallExamPct = overallFromMap(examAvgPctByCol);

  // 单评估已提交 / 已交卷 学生数
  const assignSubmittedByCol = new Map<string, number>();
  for (const sub of assignmentSubs) {
    const arr = assignSubmittedByCol.get(sub.assignmentId) ?? 0;
    if (
      sub.status === "SUBMITTED" ||
      sub.status === "GRADED" ||
      sub.status === "RETURNED"
    )
      assignSubmittedByCol.set(sub.assignmentId, arr + 1);
  }
  const examSubmittedByCol = new Map<string, number>();
  for (const att of examAttempts) {
    const arr = examSubmittedByCol.get(att.examId) ?? 0;
    if (att.status === "SUBMITTED" || att.status === "GRADING" || att.status === "GRADED")
      examSubmittedByCol.set(att.examId, arr + 1);
  }

  // 整体提交率 = 已提交总数 / (学生数 × 评估数)
  const assignSubmitRate =
    publishedAssignments.length === 0
      ? null
      : [...assignSubmittedByCol.values()].reduce((s, n) => s + n, 0) /
        (publishedAssignments.length * totalStudents);
  const examSubmitRate =
    publishedExams.length === 0
      ? null
      : [...examSubmittedByCol.values()].reduce((s, n) => s + n, 0) /
        (publishedExams.length * totalStudents);

  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-5 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">成绩分析</h2>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat
            icon={FileText}
            label="作业整体均分"
            value={overallAssignPct == null ? "—" : `${Math.round(overallAssignPct)}%`}
            tone="primary"
          />
          <Stat
            icon={GraduationCap}
            label="考试整体均分"
            value={overallExamPct == null ? "—" : `${Math.round(overallExamPct)}%`}
            tone="accent"
          />
          <Stat
            icon={FileText}
            label="作业提交率"
            value={assignSubmitRate == null ? "—" : `${Math.round(assignSubmitRate * 100)}%`}
            tone={
              assignSubmitRate == null
                ? "muted"
                : assignSubmitRate >= 0.8
                  ? "success"
                  : assignSubmitRate >= 0.6
                    ? "warning"
                    : "danger"
            }
          />
          <Stat
            icon={GraduationCap}
            label="考试交卷率"
            value={examSubmitRate == null ? "—" : `${Math.round(examSubmitRate * 100)}%`}
            tone={
              examSubmitRate == null
                ? "muted"
                : examSubmitRate >= 0.8
                  ? "success"
                  : examSubmitRate >= 0.6
                    ? "warning"
                    : "danger"
            }
          />
        </div>

        {publishedAssignments.length > 0 && assignGb && (
          <Section
            title="作业"
            columns={publishedAssignments.map((a) => ({
              id: a.id,
              title: a.title,
              totalScore: a.totalScore,
              at: a.dueAt,
            }))}
            avgMap={assignAvgPctByCol}
            subMap={assignSubmittedByCol}
            total={totalStudents}
            kind="assignment"
          />
        )}
        {publishedExams.length > 0 && examGb && (
          <Section
            title="考试"
            columns={publishedExams.map((e) => ({
              id: e.id,
              title: e.title,
              totalScore: e.totalScore,
              at: e.openAt,
            }))}
            avgMap={examAvgPctByCol}
            subMap={examSubmittedByCol}
            total={totalStudents}
            kind="exam"
          />
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: "primary" | "accent" | "success" | "warning" | "danger" | "muted";
}) {
  const toneClass = {
    primary: "bg-primary-subtle text-primary",
    accent: "bg-accent-subtle text-accent",
    success: "bg-success-subtle text-success",
    warning: "bg-warning-subtle text-warning",
    danger: "bg-danger-subtle text-danger",
    muted: "bg-muted text-muted-foreground",
  }[tone];
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className={`flex h-7 w-7 items-center justify-center rounded-md ${toneClass}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <div className="mt-2 text-xl font-semibold tracking-tight num text-foreground">{value}</div>
    </div>
  );
}

function Section({
  title,
  columns,
  avgMap,
  subMap,
  total,
  kind,
}: {
  title: string;
  columns: Array<{ id: string; title: string; totalScore: number; at: Date }>;
  avgMap: Map<string, number | null>;
  subMap: Map<string, number>;
  total: number;
  kind: "assignment" | "exam";
}) {
  return (
    <div className="mt-6">
      <div className="mb-2 text-xs text-muted-foreground">
        {title} <span className="num text-foreground">（{columns.length}）</span>
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">标题</th>
              <th className="px-3 py-2 text-left font-medium">截止/开考</th>
              <th className="px-3 py-2 text-right font-medium">班级均分</th>
              <th className="px-3 py-2 font-medium">分布</th>
              <th className="px-3 py-2 text-right font-medium">
                {kind === "assignment" ? "已交" : "已考"}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {columns.map((c) => {
              const avg = avgMap.get(c.id);
              const submitted = subMap.get(c.id) ?? 0;
              const href =
                kind === "assignment"
                  ? `/t/assignments/${c.id}/submissions`
                  : `/t/exams/${c.id}/monitor`;
              return (
                <tr key={c.id} className="transition-colors hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <Link
                      href={href}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {c.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground num">
                    {formatDate(c.at)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {avg == null ? (
                      <span className="text-subtle-foreground">—</span>
                    ) : (
                      <PctBadge value={avg} />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {avg == null ? (
                      <span className="text-subtle-foreground">—</span>
                    ) : (
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={
                            avg >= 85
                              ? "h-full bg-success/80"
                              : avg >= 60
                                ? "h-full bg-primary/80"
                                : "h-full bg-warning/80"
                          }
                          style={{ width: `${Math.max(2, Math.min(100, avg))}%` }}
                        />
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-muted-foreground num">
                    {submitted} / {total}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PctBadge({ value }: { value: number }) {
  const variant = value >= 85 ? "success" : value >= 60 ? "warning" : "danger";
  return (
    <Badge variant={variant as "success" | "warning" | "danger"}>
      <span className="num">{Math.round(value)}</span>
      <span className="text-subtle-foreground">%</span>
    </Badge>
  );
}
