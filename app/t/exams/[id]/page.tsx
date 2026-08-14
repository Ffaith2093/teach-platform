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
  Library,
  FileText,
  Users,
  Clock,
  CheckCircle2,
  AlertCircle,
  Server,
  ListChecks,
} from "lucide-react";
import type { Difficulty, ExamStatus, QuestionType } from "@prisma/client";
import { QuestionsPanel } from "./_components/questions-panel";
import { ExamActions } from "./_components/exam-actions";

export const metadata = { title: "试卷详情" };

type Tab = "overview" | "questions" | "monitor";

const STATUS_LABEL: Record<ExamStatus, { label: string; tone: "default" | "success" | "warning" }> = {
  DRAFT: { label: "草稿", tone: "default" },
  PUBLISHED: { label: "已发布", tone: "success" },
  CLOSED: { label: "已截止", tone: "warning" },
};

export default async function TeacherExamDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await auth();
  const userId = session!.user.id;
  if (session!.user.role !== "TEACHER") {
    redirect("/login?error=forbidden");
  }

  const exam = await prisma.exam.findUnique({
    where: { id },
    include: {
      course: {
        select: {
          id: true,
          title: true,
          teachers: { where: { teacherId: userId }, select: { role: true } },
        },
      },
      questions: {
        orderBy: { order: "asc" },
        include: {
          question: {
            select: {
              id: true,
              type: true,
              content: true,
              difficulty: true,
              options: true,
              answer: true,
              problemId: true,
              problem: { select: { title: true } },
            },
          },
        },
      },
    },
  });
  if (!exam) notFound();

  const myRole = exam.course.teachers[0]?.role;
  if (!myRole || (myRole !== "OWNER" && myRole !== "ASSISTANT")) {
    redirect("/t/exams?error=forbidden");
  }
  const isOwner = myRole === "OWNER";
  const isDraft = exam.status === "DRAFT";
  const now = new Date();

  // 已发布的过期判断
  const computedStatus: ExamStatus =
    exam.status === "PUBLISHED" && exam.closeAt < now ? "CLOSED" : exam.status;

  const activeTab: Tab =
    sp.tab === "questions" ? "questions" : sp.tab === "monitor" ? "monitor" : "overview";

  // stats
  const [attemptStats, inProgressCount, submittedCount] = await Promise.all([
    prisma.examAttempt.groupBy({
      by: ["status"],
      where: { examId: id },
      _count: { _all: true },
    }),
    prisma.examAttempt.count({ where: { examId: id, status: "IN_PROGRESS" } }),
    prisma.examAttempt.count({
      where: { examId: id, status: { in: ["SUBMITTED", "GRADING", "GRADED"] } },
    }),
  ]);
  const totalAttempts = attemptStats.reduce((s, x) => s + x._count._all, 0);

  const tabs: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "overview", label: "概览", icon: ListChecks },
    { key: "questions", label: `题目（${exam.questions.length}）`, icon: Library },
    { key: "monitor", label: "监考", icon: Server },
  ];

  // 可用编程题（教师本人或公开）
  const availableProblems = await prisma.problem.findMany({
    where: {
      OR: [{ authorId: userId }, { isPublic: true }],
    },
    select: { id: true, title: true, difficulty: true, isPublic: true },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  return (
    <>
      <Topbar
        crumbs={[
          { label: "我的试卷", href: "/t/exams" },
          { label: exam.title },
        ]}
      />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div>
            <Link
              href="/t/exams"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-3 w-3" />
              返回我的试卷
            </Link>
            <div className="mt-2 flex items-end justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight">{exam.title}</h1>
                  <Badge variant={STATUS_LABEL[computedStatus].tone}>
                    {STATUS_LABEL[computedStatus].label}
                  </Badge>
                  <Link
                    href={`/t/courses/${exam.course.id}`}
                    className="text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    {exam.course.title}
                  </Link>
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
                  <span className="num">{exam.durationMin}m 时长</span>
                  <span>·</span>
                  <span className="num">{exam.totalScore} 分</span>
                </div>
                {exam.instructions && (
                  <p className="mt-3 whitespace-pre-line rounded-lg border border-border bg-muted/40 p-3 text-sm text-foreground">
                    {exam.instructions}
                  </p>
                )}
              </div>
              <ExamActions
                examId={exam.id}
                status={exam.status}
                isOwner={isOwner}
                hasAttempts={totalAttempts > 0}
                questionCount={exam.questions.length}
              />
            </div>
          </div>

          {/* Tab 导航 */}
          <div className="flex items-center gap-1 border-b border-border">
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = t.key === activeTab;
              return (
                <Link
                  key={t.key}
                  href={`/t/exams/${exam.id}?tab=${t.key}`}
                  className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition-colors ${
                    active
                      ? "border-primary font-medium text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </Link>
              );
            })}
          </div>

          {activeTab === "overview" && (
            <OverviewTab
              exam={{
                durationMin: exam.durationMin,
                showResultMode: exam.showResultMode,
                shuffleQuestion: exam.shuffleQuestion,
                shuffleOption: exam.shuffleOption,
                totalScore: exam.totalScore,
                questionCount: exam.questions.length,
              }}
              totalAttempts={totalAttempts}
              inProgressCount={inProgressCount}
              submittedCount={submittedCount}
            />
          )}

          {activeTab === "questions" && (
            <QuestionsPanel
              examId={exam.id}
              isDraft={isDraft}
              availableProblems={availableProblems}
              questions={exam.questions.map((eq) => ({
                eqId: `${exam.id}:${eq.questionId}`,
                questionId: eq.questionId,
                type: eq.question.type as QuestionType,
                content: eq.question.content,
                difficulty: eq.question.difficulty as Difficulty,
                score: eq.score,
                order: eq.order,
                detail:
                  eq.question.type === "SINGLE_CHOICE"
                    ? { options: (eq.question.options as { key: string; text: string }[] | null) ?? undefined }
                    : eq.question.type === "PROGRAMMING"
                      ? {
                          problemTitle: eq.question.problem?.title,
                          problemId: eq.question.problemId ?? undefined,
                        }
                      : {
                          answer: eq.question.answer as unknown,
                        },
              }))}
            />
          )}

          {activeTab === "monitor" && (
            <MonitorTab
              totalAttempts={totalAttempts}
              inProgressCount={inProgressCount}
              submittedCount={submittedCount}
              isDraft={isDraft}
              isPublished={exam.status === "PUBLISHED"}
            />
          )}
        </div>
      </main>
    </>
  );
}

function OverviewTab({
  exam,
  totalAttempts,
  inProgressCount,
  submittedCount,
}: {
  exam: {
    durationMin: number;
    showResultMode: string;
    shuffleQuestion: boolean;
    shuffleOption: boolean;
    totalScore: number;
    questionCount: number;
  };
  totalAttempts: number;
  inProgressCount: number;
  submittedCount: number;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">题目数</div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-3xl font-bold tracking-tight num">{exam.questionCount}</span>
              <span className="text-sm text-muted-foreground">题</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">总分</div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-3xl font-bold tracking-tight num">{exam.totalScore}</span>
              <span className="text-sm text-muted-foreground">分</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">参与人次</div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-3xl font-bold tracking-tight num">{totalAttempts}</span>
              <span className="text-sm text-muted-foreground">人</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">已交卷</div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-3xl font-bold tracking-tight num">{submittedCount}</span>
              <span className="text-sm text-muted-foreground">
                份 · <span className="num text-warning">{inProgressCount}</span> 进行中
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-6">
          <h2 className="mb-3 text-base font-semibold">作答设置</h2>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Setting label="时长">
              <span className="num">{exam.durationMin}</span> 分钟
            </Setting>
            <Setting label="随机题目顺序">{exam.shuffleQuestion ? "开启" : "关闭"}</Setting>
            <Setting label="随机选项顺序">{exam.shuffleOption ? "开启" : "关闭"}</Setting>
            <Setting label="结果展示">
              {exam.showResultMode === "IMMEDIATELY"
                ? "交卷后立即"
                : exam.showResultMode === "AFTER_CLOSE"
                  ? "考试结束后"
                  : exam.showResultMode === "AFTER_GRADED"
                    ? "全部批改后"
                    : "不展示"}
            </Setting>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function Setting({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{children}</dd>
    </div>
  );
}

function MonitorTab({
  totalAttempts,
  isDraft,
  isPublished,
}: {
  totalAttempts: number;
  inProgressCount: number;
  submittedCount: number;
  isDraft: boolean;
  isPublished: boolean;
}) {
  if (isDraft) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <Server className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">试卷尚未发布</p>
          <p className="text-xs text-muted-foreground">发布后这里将展示实时监考数据。</p>
        </CardContent>
      </Card>
    );
  }

  if (!isPublished) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">考试已关闭</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="px-6 py-10 text-center">
          <Server className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-foreground">实时监考模块将在 P5.2 接入</p>
          <p className="mt-1 text-xs text-muted-foreground">
            完整功能包括学生作答进度、剩余时间、IP/设备、强制收卷。
          </p>
          <p className="mt-4 num text-xs text-muted-foreground">
            当前参考：<span className="font-medium text-foreground">{totalAttempts}</span> 人次
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
