import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Topbar } from "@/components/shell/topbar";
import { formatDate, relativeTime } from "@/lib/utils";
import { ChevronLeft, Clock, FileText, AlertCircle, CheckCircle2 } from "lucide-react";
import { startExamAction } from "../actions";

export const metadata = { title: "考试详情" };

export default async function StudentExamDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userId = session!.user.id;
  const now = new Date();

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { classId: true },
  });
  if (!me?.classId) redirect("/dashboard");

  const exam = await prisma.exam.findUnique({
    where: { id },
    include: {
      course: { select: { id: true, title: true } },
      _count: { select: { questions: true } },
    },
  });
  if (!exam || exam.status === "DRAFT") notFound();

  const accessible = await prisma.courseClass.count({
    where: { courseId: exam.courseId, classId: me.classId },
  });
  if (accessible === 0) redirect("/exams");

  const attempt = await prisma.examAttempt.findUnique({
    where: { examId_studentId: { examId: exam.id, studentId: userId } },
    select: {
      id: true,
      status: true,
      startedAt: true,
      submittedAt: true,
      deadlineAt: true,
      autoScore: true,
      finalScore: true,
    },
  });

  const isOpen = exam.status === "PUBLISHED" && exam.openAt <= now && exam.closeAt >= now;
  const notYet = exam.status === "PUBLISHED" && exam.openAt > now;
  const isOver = exam.status === "CLOSED" || (exam.status === "PUBLISHED" && exam.closeAt < now);

  // 是否可看成绩
  const showScore =
    attempt &&
    (attempt.status === "GRADED" ||
      (exam.showResultMode === "IMMEDIATELY" && attempt.status !== "IN_PROGRESS") ||
      (exam.showResultMode === "AFTER_CLOSE" && isOver));

  return (
    <>
      <Topbar crumbs={[{ label: "我的考试", href: "/exams" }, { label: exam.title }]} />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[880px] flex-col gap-6">
          <div>
            <Link
              href="/exams"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-3 w-3" />
              返回我的考试
            </Link>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{exam.title}</h1>
              <Badge variant="primary">{exam.course.title}</Badge>
              {attempt ? (
                attempt.status === "IN_PROGRESS" ? (
                  <Badge variant="warning">进行中</Badge>
                ) : attempt.status === "GRADED" ? (
                  <Badge variant="success">已批改</Badge>
                ) : (
                  <Badge variant="primary">已交卷</Badge>
                )
              ) : isOpen ? (
                <Badge variant="success">可参加</Badge>
              ) : notYet ? (
                <Badge variant="default">未开考</Badge>
              ) : (
                <Badge variant="default">已结束</Badge>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                开考 <span className="num">{formatDate(exam.openAt)}</span>
              </span>
              <span>·</span>
              <span>
                截止 <span className="num">{formatDate(exam.closeAt)}</span>
              </span>
              <span>·</span>
              <span className="num">{exam.durationMin} 分钟</span>
              <span>·</span>
              <span className="num">{exam._count.questions} 题</span>
              <span>·</span>
              <span className="num">{exam.totalScore} 分</span>
            </div>
          </div>

          {exam.instructions && (
            <Card>
              <CardContent className="p-6">
                <h2 className="mb-2 flex items-center gap-2 text-base font-semibold">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  考试说明
                </h2>
                <p className="whitespace-pre-line text-sm text-foreground">{exam.instructions}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="flex flex-col items-center gap-4 px-6 py-12 text-center">
              {attempt?.status === "IN_PROGRESS" ? (
                <>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning-subtle text-warning">
                    <AlertCircle className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">您有一场进行中的考试</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      交卷截止 <span className="num">{formatDate(attempt.deadlineAt)}</span>
                      （{relativeTime(attempt.deadlineAt)}）
                    </p>
                  </div>
                  <Button asChild>
                    <Link href={`/exams/${exam.id}/attempt/${attempt.id}`}>继续作答</Link>
                  </Button>
                </>
              ) : attempt ? (
                <>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success-subtle text-success">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">您已完成本场考试</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      交卷时间{" "}
                      <span className="num">
                        {attempt.submittedAt ? formatDate(attempt.submittedAt) : "—"}
                      </span>
                    </p>
                  </div>
                  {showScore ? (
                    <div className="rounded-xl border border-border bg-muted/40 px-8 py-4">
                      <div className="text-xs text-muted-foreground">
                        {attempt.status === "GRADED" ? "最终得分" : "客观题得分"}
                      </div>
                      <div className="mt-1 num text-3xl font-bold tracking-tight">
                        {attempt.finalScore ?? attempt.autoScore ?? 0}
                        <span className="ml-1 text-base font-normal text-muted-foreground">
                          / {exam.totalScore}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">成绩尚未公布，请等待教师批改。</p>
                  )}
                </>
              ) : isOpen ? (
                <>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-subtle text-primary">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">准备好了吗？</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      开始后将计时 <span className="num">{exam.durationMin}</span> 分钟，中途关闭页面不会暂停，仅有一次机会。
                    </p>
                  </div>
                  <form
                    action={async () => {
                      "use server";
                      await startExamAction(exam.id);
                    }}
                  >
                    <Button type="submit">开始考试</Button>
                  </form>
                </>
              ) : notYet ? (
                <>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Clock className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-medium text-foreground">考试尚未开始</p>
                  <p className="text-xs text-muted-foreground">
                    将于 <span className="num">{formatDate(exam.openAt)}</span> 开考（
                    {relativeTime(exam.openAt)}）
                  </p>
                </>
              ) : (
                <>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <AlertCircle className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-medium text-foreground">考试已结束</p>
                  <p className="text-xs text-muted-foreground">您未参加本场考试。</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
