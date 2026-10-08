import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Topbar } from "@/components/shell/topbar";
import { formatDate, relativeTime } from "@/lib/utils";
import {
  ChevronLeft,
  Clock,
  Users,
  ClipboardCheck,
  CheckCircle2,
} from "lucide-react";
import { GradeRow } from "./_components/grade-row";

export const metadata = { title: "批改作业" };

export default async function GradeAssignmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userId = session!.user.id;

  const assignment = await prisma.assignment.findUnique({
    where: { id },
    include: {
      questions: { include: { question: { select: { content: true } } }, orderBy: { order: "asc" } },
      course: {
        select: {
          id: true,
          title: true,
          teachers: {
            where: { teacherId: userId },
            select: { role: true },
          },
          classes: {
            include: {
              class: {
                include: {
                  grade: { select: { name: true } },
                  students: {
                    where: { status: "ACTIVE", role: "STUDENT" },
                    select: { id: true, name: true, studentNo: true },
                    orderBy: [{ studentNo: "asc" }],
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!assignment) notFound();

  const myRole = assignment.course.teachers[0]?.role;
  if (!myRole || (myRole !== "OWNER" && myRole !== "ASSISTANT")) {
    redirect("/t/assignments?error=forbidden");
  }

  const isDraft = !assignment.publishedAt;
  const now = new Date();
  const isOverdue = !isDraft && assignment.dueAt < now;

  // 所有学生（按班级）
  const allStudents = assignment.course.classes.flatMap((cc) =>
    cc.class.students.map((s) => ({
      id: s.id,
      name: s.name,
      studentNo: s.studentNo,
      className: cc.class.name,
      gradeName: cc.class.grade.name,
    })),
  );

  // 所有 submission
  const submissions = await prisma.assignmentSubmission.findMany({
    where: {
      assignmentId: id,
      studentId: { in: allStudents.map((s) => s.id) },
    },
    select: {
      id: true,
      studentId: true,
      status: true,
      autoScore: true,
      manualScore: true,
      finalScore: true,
      feedback: true,
      submittedAt: true,
      gradedAt: true,
      answers: true,
      textContent: true,
      fileName: true,
    },
  });
  const subByStudent = new Map(submissions.map((s) => [s.studentId, s]));

  // Stats
  const statusCount = { DRAFT: 0, SUBMITTED: 0, GRADED: 0, RETURNED: 0 } as Record<
    "DRAFT" | "SUBMITTED" | "GRADED" | "RETURNED",
    number
  >;
  for (const s of submissions) statusCount[s.status]++;
  const finals = submissions
    .filter((s) => s.finalScore != null)
    .map((s) => s.finalScore as number);
  const avgScore =
    finals.length > 0 ? Math.round(finals.reduce((s, n) => s + n, 0) / finals.length) : null;

  // 按班级分组渲染
  const byClass = new Map<string, typeof allStudents>();
  for (const s of allStudents) {
    const arr = byClass.get(s.className) ?? [];
    arr.push(s);
    byClass.set(s.className, arr);
  }

  return (
    <>
      <Topbar
        crumbs={[
          { label: "批改工作台", href: "/t/grading" },
          { label: assignment.title, href: `/t/assignments/${assignment.id}` },
          { label: "批改" },
        ]}
      />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div>
            <Link
              href={`/t/assignments/${assignment.id}`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-3 w-3" />
              返回作业详情
            </Link>
            <div className="mt-2 flex items-end justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight">
                  批改「{assignment.title}」
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  <Link
                    href={`/t/courses/${assignment.course.id}`}
                    className="hover:text-primary"
                  >
                    {assignment.course.title}
                  </Link>
                  <span className="mx-2 text-subtle-foreground">·</span>
                  截止 <span className="num">{formatDate(assignment.dueAt)}</span>
                  <span className="mx-1.5 text-subtle-foreground">·</span>
                  <span className="num">{assignment.totalScore}</span> 分
                  <span className="mx-2 text-subtle-foreground">·</span>
                  <span className="num">{allStudents.length}</span> 名学生
                </p>
              </div>
              <Link
                href={`/t/assignments/${assignment.id}`}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                查看题库
              </Link>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <span className="text-sm text-muted-foreground">待批改</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning-subtle text-warning">
                    <ClipboardCheck className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3 text-3xl font-bold tracking-tight num">
                  {statusCount.SUBMITTED}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <span className="text-sm text-muted-foreground">已批改</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success-subtle text-success">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3 text-3xl font-bold tracking-tight num">
                  {statusCount.GRADED}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <span className="text-sm text-muted-foreground">未提交</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Users className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3 text-3xl font-bold tracking-tight num">
                  {allStudents.length - submissions.length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <span className="text-sm text-muted-foreground">已批改均分</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                    <Clock className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3 text-3xl font-bold tracking-tight num">
                  {avgScore ?? "—"}
                </div>
                {avgScore != null && (
                  <p className="mt-1 text-[11px] text-subtle-foreground">
                    基于 {finals.length} 份成绩
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 班级分组 */}
          {isDraft && (
            <div className="rounded-xl border border-warning/40 bg-warning-subtle/40 p-4 text-xs text-warning">
              此作业尚未发布。学生无法提交。
            </div>
          )}

          {[...byClass.entries()].map(([className, students]) => (
            <Card key={className}>
              <CardContent className="p-0">
                <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-6 py-3">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">{className}</span>
                  </div>
                  <span className="num text-xs text-muted-foreground">
                    已交 <b className="text-foreground">{students.filter((s) => subByStudent.get(s.id)).length}</b>{" "}
                    / 共 <b className="text-foreground">{students.length}</b>
                  </span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-left text-xs font-medium text-muted-foreground">
                      <th className="px-6 py-2.5">学号</th>
                      <th className="px-6 py-2.5">姓名</th>
                      <th className="px-6 py-2.5">班级</th>
                      <th className="px-6 py-2.5">提交内容</th>
                      <th className="px-6 py-2.5">提交时间</th>
                      <th className="px-6 py-2.5">自动分</th>
                      <th className="px-6 py-2.5">手动分 + 反馈</th>
                      <th className="px-6 py-2.5">终分</th>
                      <th className="px-6 py-2.5">批改时间</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {students.map((s) => {
                      const sub = subByStudent.get(s.id);
                      return (
                        <GradeRow
                          key={s.id}
                          student={s}
                          totalScore={assignment.totalScore}
                          submission={
                            sub
                              ? {
                                  id: sub.id,
                                  status: sub.status,
                                  autoScore: sub.autoScore,
                                  manualScore: sub.manualScore,
                                  finalScore: sub.finalScore,
                                  feedback: sub.feedback,
                                  submittedAt: sub.submittedAt,
                                  gradedAt: sub.gradedAt,
                                  answers: sub.answers,
                                  textContent: sub.textContent,
                                  fileName: sub.fileName,
                                }
                              : {
                                  id: null,
                                  status: "NONE",
                                  autoScore: null,
                                  manualScore: null,
                                  finalScore: null,
                                  feedback: null,
                                  submittedAt: null,
                                  gradedAt: null,
                                  answers: null,
                                  textContent: null,
                                  fileName: null,
                                }
                          }
                          questionContents={Object.fromEntries(assignment.questions.map((item) => [item.questionId, item.question.content]))}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </>
  );
}
