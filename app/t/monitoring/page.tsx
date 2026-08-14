import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Topbar } from "@/components/shell/topbar";
import { formatDate, relativeTime } from "@/lib/utils";
import {
  Activity,
  Server,
  AlertCircle,
  Hourglass,
  CheckCircle2,
  ChevronRight,
  Timer,
  GraduationCap,
  XCircle,
} from "lucide-react";

export const metadata = { title: "考试全局监控" };
export const dynamic = "force-dynamic"; // 实时性要求：教师每次刷新看最新进度

const HOUR = 60 * 60 * 1000;

type ExamLite = {
  id: string;
  title: string;
  totalScore: number;
  openAt: Date;
  closeAt: Date;
  durationMin: number;
  course: { id: string; title: string };
  questionCount: number;
  /** 该考试应到学生数（班级去重） */
  expectedStudents: number;
  /** 学生提交状态分组 */
  attemptCounts: {
    NOT_STARTED: number;
    IN_PROGRESS: number;
    SUBMITTED: number;
    GRADED: number;
  };
};

export default async function TeacherMonitoringPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const userId = session.user.id;
  if (session.user.role !== "TEACHER") redirect("/t/dashboard?error=forbidden");

  const now = new Date();

  // 我作为主讲/助教的所有未归档课程
  const memberships = await prisma.courseTeacher.findMany({
    where: { teacherId: userId, role: { in: ["OWNER", "ASSISTANT"] } },
    select: { courseId: true, course: { select: { isArchived: true } } },
  });
  const myCourseIds = memberships
    .filter((m) => !m.course.isArchived)
    .map((m) => m.courseId);

  if (myCourseIds.length === 0) {
    return (
      <>
        <Topbar crumbs={[{ label: "考试全局监控" }]} />
        <main className="flex-1 p-8">
          <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
            <h1 className="text-2xl font-semibold tracking-tight">考试全局监控</h1>
            <Card>
              <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Server className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  您尚未加入任何课程
                </p>
                <p className="text-xs text-muted-foreground">
                  请联系管理员把您加入课程后再来查看全局监控。
                </p>
              </CardContent>
            </Card>
          </div>
        </main>
      </>
    );
  }

  // 3 个时间窗口：即将开考 / 进行中 / 刚刚结束
  const upperBound = new Date(now.getTime() + 24 * HOUR); // 24h 内即将开考
  const lowerBound = new Date(now.getTime() - 1 * HOUR); // 1h 内刚结束
  const examsRaw = await prisma.exam.findMany({
    where: {
      courseId: { in: myCourseIds },
      status: "PUBLISHED",
      OR: [
        { openAt: { gt: now, lte: upperBound } }, // 即将开考
        { openAt: { lte: now }, closeAt: { gte: now } }, // 进行中
        { closeAt: { gt: lowerBound, lt: now } }, // 刚结束
      ],
    },
    orderBy: { openAt: "asc" },
    select: {
      id: true,
      title: true,
      totalScore: true,
      courseId: true,
      openAt: true,
      closeAt: true,
      durationMin: true,
      course: { select: { id: true, title: true } },
      _count: { select: { questions: true } },
    },
  });

  const examIds = examsRaw.map((e) => e.id);
  const courseIds = [...new Set(examsRaw.map((e) => e.courseId))];

  // 学生总数（按 course，去重）
  const courseClasses = await prisma.courseClass.findMany({
    where: { courseId: { in: courseIds } },
    select: {
      courseId: true,
      class: {
        select: {
          students: {
            where: { status: "ACTIVE", role: "STUDENT" },
            select: { id: true },
          },
        },
      },
    },
  });
  const studentsByCourse = new Map<string, Set<string>>();
  for (const cc of courseClasses) {
    let set = studentsByCourse.get(cc.courseId);
    if (!set) {
      set = new Set<string>();
      studentsByCourse.set(cc.courseId, set);
    }
    for (const st of cc.class.students) set.add(st.id);
  }

  // attempts groupBy → 进度
  const attemptStats =
    examIds.length > 0
      ? await prisma.examAttempt.groupBy({
          by: ["examId", "status"],
          where: { examId: { in: examIds } },
          _count: { _all: true },
        })
      : [];
  const countsByExam = new Map<string, ExamLite["attemptCounts"]>();
  for (const stat of attemptStats) {
    const cur = countsByExam.get(stat.examId) ?? {
      NOT_STARTED: 0,
      IN_PROGRESS: 0,
      SUBMITTED: 0,
      GRADED: 0,
    };
    // 把 ENROLLED 视作 NOT_STARTED；其他按字面意义
    if (stat.status in cur) {
      cur[stat.status as keyof ExamLite["attemptCounts"]] = stat._count._all;
    }
    countsByExam.set(stat.examId, cur);
  }

  const exams: ExamLite[] = examsRaw.map((e) => {
    const counts = countsByExam.get(e.id) ?? {
      NOT_STARTED: 0,
      IN_PROGRESS: 0,
      SUBMITTED: 0,
      GRADED: 0,
    };
    const expected = studentsByCourse.get(e.courseId)?.size ?? 0;
    const recorded = counts.IN_PROGRESS + counts.SUBMITTED + counts.GRADED;
    counts.NOT_STARTED = Math.max(0, expected - recorded);
    return {
      id: e.id,
      title: e.title,
      totalScore: e.totalScore,
      openAt: e.openAt,
      closeAt: e.closeAt,
      durationMin: e.durationMin,
      course: e.course,
      questionCount: e._count.questions,
      expectedStudents: expected,
      attemptCounts: counts,
    };
  });

  // 桶：即将开始 / 进行中 / 刚刚结束
  const upcoming = exams.filter((e) => e.openAt > now);
  const ongoing = exams.filter((e) => e.openAt <= now && e.closeAt >= now);
  const recentlyClosed = exams.filter((e) => e.closeAt < now);

  const summary = [
    {
      label: "进行中",
      count: ongoing.length,
      tone: "primary" as const,
      icon: Activity,
    },
    {
      label: "即将开考 (24h)",
      count: upcoming.length,
      tone: "warning" as const,
      icon: Timer,
    },
    {
      label: "刚刚结束 (1h)",
      count: recentlyClosed.length,
      tone: "muted" as const,
      icon: CheckCircle2,
    },
    {
      label: "今日考试",
      count: countToday(exams),
      tone: "muted" as const,
      icon: GraduationCap,
    },
  ];

  return (
    <>
      <Topbar crumbs={[{ label: "考试全局监控" }]} />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              考试全局监控
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              实时展示您所授课程下处于「即将开考 / 进行中 / 刚刚结束」三窗口的考试与进度。
            </p>
          </div>

          {/* 概览 4 张卡 */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {summary.map((s) => {
              const Icon = s.icon;
              return (
                <Card key={s.label}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <span className="text-sm text-muted-foreground">{s.label}</span>
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                          s.tone === "primary"
                            ? "bg-primary-subtle text-primary"
                            : s.tone === "warning"
                              ? "bg-warning-subtle text-warning"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="mt-3 num text-3xl font-bold tracking-tight">
                      {s.count}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {s.label.startsWith("进行中")
                        ? "实时刷新"
                        : s.label.startsWith("即将开考")
                          ? "未来 24h"
                          : s.label.startsWith("刚刚结束")
                            ? "过去 1h"
                            : "按 openAt 落在今天"}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {exams.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Server className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  当前没有进行中 / 即将开始 / 刚刚结束的考试
                </p>
                <p className="text-xs text-muted-foreground">
                  新发布的考试开考前 24 小时会自动出现在此页。
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {ongoing.length > 0 && (
                <Section
                  icon={Activity}
                  title="进行中"
                  tone="primary"
                  subtitle="正在考试，剩余时间实时倒计时"
                >
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {ongoing.map((e) => (
                      <ExamCard key={e.id} exam={e} kind="ongoing" />
                    ))}
                  </div>
                </Section>
              )}

              {upcoming.length > 0 && (
                <Section
                  icon={Timer}
                  title="即将开考"
                  tone="warning"
                  subtitle="未来 24 小时内开考"
                >
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {upcoming.map((e) => (
                      <ExamCard key={e.id} exam={e} kind="upcoming" />
                    ))}
                  </div>
                </Section>
              )}

              {recentlyClosed.length > 0 && (
                <Section
                  icon={CheckCircle2}
                  title="刚刚结束"
                  tone="muted"
                  subtitle="过去 1 小时内收卷"
                >
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {recentlyClosed.map((e) => (
                      <ExamCard key={e.id} exam={e} kind="closed" />
                    ))}
                  </div>
                </Section>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}

function countToday(exams: ExamLite[]): number {
  const today = new Date();
  let n = 0;
  for (const e of exams) {
    const od = e.openAt;
    if (
      od.getFullYear() === today.getFullYear() &&
      od.getMonth() === today.getMonth() &&
      od.getDate() === today.getDate()
    )
      n++;
  }
  return n;
}

function Section({
  icon: Icon,
  title,
  subtitle,
  tone,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  tone: "primary" | "warning" | "muted";
  children: React.ReactNode;
}) {
  const toneCls =
    tone === "primary"
      ? "bg-primary-subtle text-primary"
      : tone === "warning"
        ? "bg-warning-subtle text-warning"
        : "bg-muted text-muted-foreground";
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <div className={`flex h-7 w-7 items-center justify-center rounded-md ${toneCls}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <h2 className="text-base font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">· {subtitle}</span>
      </div>
      {children}
    </section>
  );
}

function ExamCard({
  exam,
  kind,
}: {
  exam: ExamLite;
  kind: "ongoing" | "upcoming" | "closed";
}) {
  const { attemptCounts, expectedStudents } = exam;
  const started = attemptCounts.IN_PROGRESS + attemptCounts.SUBMITTED + attemptCounts.GRADED;
  const submitted = attemptCounts.SUBMITTED + attemptCounts.GRADED;
  const submittedRate =
    expectedStudents > 0 ? Math.min(100, Math.round((submitted / expectedStudents) * 100)) : 0;

  // 倒计时 / 已结束 / 未开始
  const now = new Date();
  const remainMs = exam.closeAt.getTime() - now.getTime();
  const untilStartMs = exam.openAt.getTime() - now.getTime();

  return (
    <Card className={kind === "ongoing" ? "border-primary/40" : ""}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/t/exams/${exam.id}`}
                className="truncate text-base font-semibold text-foreground transition-colors hover:text-primary"
              >
                {exam.title}
              </Link>
              {kind === "ongoing" && (
                <Badge variant="primary">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                  进行中
                </Badge>
              )}
              {kind === "upcoming" && (
                <Badge variant="warning">
                  <Hourglass className="mr-1 inline h-3 w-3" />
                  即将开考
                </Badge>
              )}
              {kind === "closed" && (
                <Badge variant="default">
                  <CheckCircle2 className="mr-1 inline h-3 w-3" />
                  已结束
                </Badge>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <Link
                href={`/t/courses/${exam.course.id}`}
                className="transition-colors hover:text-primary"
              >
                {exam.course.title}
              </Link>
              <span>·</span>
              <span className="num">{exam.questionCount} 题</span>
              <span>·</span>
              <span className="num">{exam.durationMin}m 时长</span>
              <span>·</span>
              <span className="num">{exam.totalScore} 分</span>
              <span>·</span>
              <span>应到 <span className="num">{expectedStudents}</span> 人</span>
            </div>
          </div>
        </div>

        {/* 进度条 */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">已交卷进度</span>
            <span className="num">
              <b className="text-foreground">{submitted}</b>
              <span className="text-muted-foreground"> / {expectedStudents}</span>
              <span className="ml-1.5 text-muted-foreground">({submittedRate}%)</span>
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${submittedRate}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-warning" />
              进行中 <span className="num text-foreground">{attemptCounts.IN_PROGRESS}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
              已交卷 <span className="num text-foreground">{submitted}</span>
            </span>
            {attemptCounts.NOT_STARTED > 0 && (
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                未开考 <span className="num text-foreground">{attemptCounts.NOT_STARTED}</span>
              </span>
            )}
          </div>
        </div>

        {/* 底部时间 + 操作 */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          <div className="text-xs text-muted-foreground">
            {kind === "ongoing" && (
              <span>
                <span className="inline-flex items-center gap-1 text-warning">
                  <Timer className="h-3 w-3" />
                  剩余 <span className="num font-medium">{formatRemain(remainMs)}</span>
                </span>
                <span className="ml-2">· {formatDate(exam.closeAt)} 截止</span>
              </span>
            )}
            {kind === "upcoming" && (
              <span>
                <span className="inline-flex items-center gap-1">
                  <Hourglass className="h-3 w-3" />
                  <span className="num">
                    {untilStartMs > 0 ? `还有 ${relativeTime(exam.openAt)}` : "即将开考"}
                  </span>
                </span>
                <span className="ml-2">· {formatDate(exam.openAt)} 开考</span>
              </span>
            )}
            {kind === "closed" && (
              <span className="inline-flex items-center gap-1">
                <XCircle className="h-3 w-3" />
                <span className="num">{relativeTime(exam.closeAt)}收卷</span>
                <span className="ml-2">· {formatDate(exam.closeAt)}</span>
              </span>
            )}
          </div>
          {kind === "ongoing" ? (
            <Link
              href={`/t/exams/${exam.id}/monitor`}
              className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Server className="h-3.5 w-3.5" />
              进入监考
              <ChevronRight className="h-3 w-3" />
            </Link>
          ) : kind === "upcoming" ? (
            <Link
              href={`/t/exams/${exam.id}`}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              查看试卷
              <ChevronRight className="h-3 w-3" />
            </Link>
          ) : (
            <Link
              href={`/t/exams/${exam.id}/grade`}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              去批改
              <ChevronRight className="h-3 w-3" />
            </Link>
          )}
        </div>

        {/* 异常兜底 */}
        {kind === "ongoing" && expectedStudents > 0 && submittedRate === 100 && (
          <div className="mt-3 rounded-lg border border-success/30 bg-success-subtle/40 p-2 text-[11px] text-success">
            <CheckCircle2 className="mr-1 inline h-3 w-3" />
            全员已交卷，可进入批改。
          </div>
        )}
        {kind === "ongoing" && remainMs < 5 * 60 * 1000 && remainMs > 0 && (
          <div className="mt-3 flex items-center gap-1 rounded-lg border border-warning/30 bg-warning-subtle/40 p-2 text-[11px] text-warning">
            <AlertCircle className="h-3 w-3" />
            剩余不到 5 分钟，请关注未交卷学生。
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** "1h 23m" / "12m 5s" / "已截止" */
function formatRemain(ms: number): string {
  if (ms <= 0) return "已截止";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
