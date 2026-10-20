import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Topbar } from "@/components/shell/topbar";
import { formatDate } from "@/lib/utils";
import { Award, ChevronRight, FileText, GraduationCap, Trophy } from "lucide-react";

export const metadata = { title: "成绩单" };

function competitionRank(score: number, scores: number[]): number {
  return scores.filter((candidate) => candidate > score).length + 1;
}

export default async function StudentGradesPage() {
  const session = await auth();
  const userId = session!.user.id;
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { classId: true } });
  if (!me?.classId) redirect("/dashboard");

  const classmates = await prisma.user.findMany({
    where: { classId: me.classId, role: "STUDENT", status: "ACTIVE" },
    select: { id: true },
  });
  const classmateIds = classmates.map((student) => student.id);

  const [assignmentScores, examScores] = await Promise.all([
    prisma.assignmentSubmission.findMany({
      where: {
        studentId: { in: classmateIds },
        status: "GRADED",
        finalScore: { not: null },
        assignment: { publishedAt: { not: null } },
      },
      select: {
        studentId: true,
        finalScore: true,
        gradedAt: true,
        submittedAt: true,
        assignment: {
          select: {
            id: true,
            title: true,
            totalScore: true,
            dueAt: true,
            course: { select: { title: true } },
          },
        },
      },
    }),
    prisma.examAttempt.findMany({
      where: {
        studentId: { in: classmateIds },
        status: "GRADED",
        finalScore: { not: null },
        exam: { classSessions: { some: { classId: me.classId, status: "CLOSED" } } },
      },
      select: {
        studentId: true,
        finalScore: true,
        submittedAt: true,
        exam: {
          select: {
            id: true,
            title: true,
            totalScore: true,
            course: { select: { title: true } },
          },
        },
      },
    }),
  ]);

  const assignmentById = new Map<string, Map<string, number>>();
  for (const item of assignmentScores) {
    const scores = assignmentById.get(item.assignment.id) ?? new Map<string, number>();
    scores.set(item.studentId, item.finalScore ?? 0);
    assignmentById.set(item.assignment.id, scores);
  }
  const examById = new Map<string, Map<string, number>>();
  for (const item of examScores) {
    const scores = examById.get(item.exam.id) ?? new Map<string, number>();
    scores.set(item.studentId, item.finalScore ?? 0);
    examById.set(item.exam.id, scores);
  }

  const assignmentRows = assignmentScores
    .filter((item) => item.studentId === userId)
    .map((item) => {
      const participants = assignmentById.get(item.assignment.id) ?? new Map<string, number>();
      const score = item.finalScore ?? 0;
      return {
        key: `assignment:${item.assignment.id}`,
        assessmentId: item.assignment.id,
        type: "assignment" as const,
        title: item.assignment.title,
        courseTitle: item.assignment.course.title,
        score,
        totalScore: item.assignment.totalScore,
        rank: competitionRank(score, [...participants.values()]),
        participants: participants.size,
        date: item.gradedAt ?? item.submittedAt ?? item.assignment.dueAt,
        href: `/assignments/${item.assignment.id}`,
      };
    });
  const examRows = examScores
    .filter((item) => item.studentId === userId)
    .map((item) => {
      const participants = examById.get(item.exam.id) ?? new Map<string, number>();
      const score = item.finalScore ?? 0;
      return {
        key: `exam:${item.exam.id}`,
        assessmentId: item.exam.id,
        type: "exam" as const,
        title: item.exam.title,
        courseTitle: item.exam.course.title,
        score,
        totalScore: item.exam.totalScore,
        rank: competitionRank(score, [...participants.values()]),
        participants: participants.size,
        date: item.submittedAt ?? new Date(0),
        href: `/exams/${item.exam.id}/result`,
      };
    });
  const rows = [...assignmentRows, ...examRows].sort((a, b) => b.date.getTime() - a.date.getTime());

  const totalEarned = rows.reduce((sum, row) => sum + row.score, 0);
  const totalAvailable = rows.reduce((sum, row) => sum + row.totalScore, 0);
  const totalsByStudent = new Map(classmateIds.map((id) => [id, 0]));
  for (const row of rows) {
    const scores =
      row.type === "assignment"
        ? assignmentById.get(row.assessmentId)
        : examById.get(row.assessmentId);
    for (const studentId of classmateIds) {
      totalsByStudent.set(
        studentId,
        (totalsByStudent.get(studentId) ?? 0) + (scores?.get(studentId) ?? 0),
      );
    }
  }
  const overallRank = competitionRank(totalEarned, [...totalsByStudent.values()]);

  return (
    <>
      <Topbar crumbs={[{ label: "成绩单" }]} />
      <main className="min-w-0 flex-1 p-4 md:p-8">
        <div className="mx-auto flex max-w-[1024px] flex-col gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">成绩单</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">仅显示已经自动出分的作业与考试。</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardContent className="flex items-center gap-4 p-6">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                  <Award className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">累计总得分</div>
                  <div className="mt-1 text-3xl font-bold tabular-nums text-foreground">
                    {totalEarned}
                    <span className="ml-1 text-base font-normal text-muted-foreground">
                      / {totalAvailable}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 p-6">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent-subtle text-accent">
                  <Trophy className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">班级总排名</div>
                  <div className="mt-1 text-3xl font-bold tabular-nums text-foreground">
                    第 {overallRank}
                    <span className="ml-1 text-base font-normal text-muted-foreground">
                      / {classmates.length}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {rows.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <Trophy className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm font-medium">暂无已出分成绩</p>
                <p className="text-xs text-muted-foreground">
                  作业自动评测完成或教师结束考试后，成绩会显示在这里。
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                        <th className="px-6 py-3">项目</th>
                        <th className="px-6 py-3">课程</th>
                        <th className="px-6 py-3">出分时间</th>
                        <th className="px-6 py-3 text-center">成绩</th>
                        <th className="px-6 py-3 text-center">班级排名</th>
                        <th className="w-12 px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rows.map((row) => (
                        <tr key={row.key} className="hover:bg-muted/20">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              {row.type === "assignment" ? (
                                <FileText className="h-4 w-4 text-primary" />
                              ) : (
                                <GraduationCap className="h-4 w-4 text-accent" />
                              )}
                              <Link href={row.href} className="font-medium hover:text-primary">
                                {row.title}
                              </Link>
                              <Badge variant="default">
                                {row.type === "assignment" ? "作业" : "考试"}
                              </Badge>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-muted-foreground">{row.courseTitle}</td>
                          <td className="px-6 py-4 text-xs tabular-nums text-muted-foreground">
                            {formatDate(row.date)}
                          </td>
                          <td className="px-6 py-4 text-center font-semibold tabular-nums">
                            {row.score} / {row.totalScore}
                          </td>
                          <td className="px-6 py-4 text-center tabular-nums">
                            第 {row.rank} / {row.participants}
                          </td>
                          <td className="px-4 py-4">
                            <Link href={row.href} aria-label={`查看${row.title}`}>
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="divide-y divide-border md:hidden">
                  {rows.map((row) => (
                    <Link
                      key={row.key}
                      href={row.href}
                      className="block px-4 py-4 hover:bg-muted/20"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium">{row.title}</span>
                            <Badge variant="default">
                              {row.type === "assignment" ? "作业" : "考试"}
                            </Badge>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {row.courseTitle} · {formatDate(row.date)}
                          </div>
                        </div>
                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      </div>
                      <div className="mt-3 flex items-center justify-between text-sm">
                        <span className="font-semibold tabular-nums">
                          {row.score} / {row.totalScore}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          班级第 {row.rank} / {row.participants}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </>
  );
}
