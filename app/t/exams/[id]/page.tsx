import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Topbar } from "@/components/shell/topbar";
import { formatDate } from "@/lib/utils";
import {
  ChevronLeft,
  Library,
  Clock,
  BarChart3,
  ListChecks,
} from "lucide-react";
import type { Difficulty, ExamStatus, QuestionType } from "@prisma/client";
import { QuestionsPanel } from "./_components/questions-panel";
import { ExamActions } from "./_components/exam-actions";
import { AnalyticsTab } from "./_components/analytics-tab";
import { drawRulesSchema } from "@/lib/exams/rules";
import { ExamClassControls } from "./_components/exam-class-controls";

export const metadata = { title: "试卷详情" };

type Tab = "overview" | "questions" | "analytics";

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
  searchParams: Promise<{ tab?: string; classId?: string }>;
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
          classes: {
            select: {
              class: {
                select: {
                  id: true,
                  name: true,
                  grade: { select: { name: true } },
                  _count: {
                    select: { students: { where: { role: "STUDENT", status: "ACTIVE" } } },
                  },
                },
              },
            },
          },
        },
      },
      classSessions: {
        select: { classId: true, status: true, openedAt: true, closedAt: true },
      },
      _count: { select: { attempts: true } },
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
  const drawConfig = exam.drawRules ? drawRulesSchema.safeParse(exam.drawRules) : null;
  const actualCount = drawConfig?.success ? drawConfig.data.rules.reduce((sum, rule) => sum + rule.count, 0) : exam.questions.length;
  const classOptions = exam.course.classes
    .map(({ class: item }) => ({
      id: item.id,
      label: `${item.grade.name} · ${item.name}`,
      studentCount: item._count.students,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "zh-CN", { numeric: true }));
  const selectedClassId = classOptions.some((item) => item.id === sp.classId)
    ? sp.classId!
    : (classOptions[0]?.id ?? "");
  const selectedClass = classOptions.find((item) => item.id === selectedClassId);
  const selectedClassSession = exam.classSessions.find((item) => item.classId === selectedClassId);
  const classSessionStatus = selectedClassSession?.status ?? "PENDING";

  const activeTab: Tab =
    sp.tab === "questions" ? "questions" : sp.tab === "analytics" ? "analytics" : "overview";

  // stats
  const attemptRows = selectedClassId
    ? await prisma.examAttempt.findMany({
        where: { examId: id, student: { classId: selectedClassId } },
        select: { status: true },
      })
    : [];
  const totalAttempts = attemptRows.length;
  const inProgressCount = attemptRows.filter((item) => item.status === "IN_PROGRESS").length;
  const submittedCount = attemptRows.filter((item) => item.status !== "IN_PROGRESS").length;
  const pendingGradeCount = attemptRows.filter((item) => item.status === "SUBMITTED" || item.status === "GRADING").length;

  const tabs: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "overview", label: "概览", icon: ListChecks },
    { key: "questions", label: `题目（${actualCount}）`, icon: Library },
    { key: "analytics", label: "分析", icon: BarChart3 },
  ];

  // 可用编程题（教师本人或公开）
  const availableProblems = await prisma.problem.findMany({
    where: {
      OR: [{ authorId: userId }, { isPublic: true }],
      questions: { none: { examQuestions: { some: { examId: exam.id } } } },
    },
    select: { id: true, title: true, difficulty: true, isPublic: true },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  const availableLibraryQuestions = await prisma.question.findMany({
    where: {
      bankId: { not: null },
      bank: { ownerId: userId },
      type: { in: ["SINGLE_CHOICE", "FILL_BLANK"] },
      examQuestions: { none: { examId: exam.id } },
    },
    select: {
      id: true,
      type: true,
      content: true,
      difficulty: true,
      score: true,
      bank: { select: { name: true } },
    },
    orderBy: { id: "asc" },
    take: 1000,
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
                  <Badge variant={STATUS_LABEL[exam.status].tone}>
                    {STATUS_LABEL[exam.status].label}
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
                    <span className="num">{exam.durationMin} 分钟</span>
                  </span>
                  <span>·</span>
                  <span className="num">{exam.totalScore} 分</span>
                  <span>·</span>
                  <span>由教师按班级统一开考和收卷</span>
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
                hasAttempts={exam._count.attempts > 0}
                questionCount={actualCount}
                pendingGradeCount={pendingGradeCount}
                classId={selectedClassId}
              />
            </div>
          </div>

          <ExamClassControls
            examId={exam.id}
            examStatus={exam.status}
            activeTab={activeTab}
            classes={classOptions}
            selectedClassId={selectedClassId}
            sessionStatus={classSessionStatus}
            openedAt={selectedClassSession?.openedAt ? formatDate(selectedClassSession.openedAt) : null}
            closedAt={selectedClassSession?.closedAt ? formatDate(selectedClassSession.closedAt) : null}
          />

          {/* Tab 导航 */}
          <div className="flex items-center gap-1 border-b border-border">
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = t.key === activeTab;
              return (
                <Link
                  key={t.key}
                  href={`/t/exams/${exam.id}?tab=${t.key}${selectedClassId ? `&classId=${selectedClassId}` : ""}`}
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
                shuffleQuestion: exam.shuffleQuestion,
                shuffleOption: exam.shuffleOption,
                totalScore: exam.totalScore,
                questionCount: actualCount,
              }}
              totalAttempts={totalAttempts}
              inProgressCount={inProgressCount}
              submittedCount={submittedCount}
              classLabel={selectedClass?.label ?? "未选择班级"}
              sessionStatus={classSessionStatus}
            />
          )}

          {activeTab === "questions" && (
            <QuestionsPanel
              examId={exam.id}
              isDraft={isDraft}
              isDraw={!!exam.drawRules}
              actualCount={actualCount}
              examTotalScore={exam.totalScore}
              availableProblems={availableProblems}
              availableLibraryQuestions={availableLibraryQuestions.map((question) => ({
                id: question.id,
                type: question.type as "SINGLE_CHOICE" | "FILL_BLANK",
                content: question.content,
                difficulty: question.difficulty,
                defaultScore: question.score,
                bankName: question.bank?.name ?? "公共题库",
              }))}
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

          {activeTab === "analytics" && selectedClassId && (
            <AnalyticsTab examId={exam.id} classId={selectedClassId} />
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
  classLabel,
  sessionStatus,
}: {
  exam: {
    durationMin: number;
    shuffleQuestion: boolean;
    shuffleOption: boolean;
    totalScore: number;
    questionCount: number;
  };
  totalAttempts: number;
  inProgressCount: number;
  submittedCount: number;
  classLabel: string;
  sessionStatus: "PENDING" | "OPEN" | "CLOSED";
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
          <h2 className="mb-1 text-base font-semibold">{classLabel}</h2>
          <p className="mb-4 text-xs text-muted-foreground">以下设置与统计均针对当前选择的班级。</p>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Setting label="时长">
              <span className="num">{exam.durationMin}</span> 分钟
            </Setting>
            <Setting label="随机题目顺序">{exam.shuffleQuestion ? "开启" : "关闭"}</Setting>
            <Setting label="随机选项顺序">{exam.shuffleOption ? "开启" : "关闭"}</Setting>
            <Setting label="班级场次">
              {sessionStatus === "PENDING" ? "等待教师开放" : sessionStatus === "OPEN" ? "进行中" : "已结束并出分"}
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
