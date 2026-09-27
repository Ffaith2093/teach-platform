import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Topbar } from "@/components/shell/topbar";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Users,
  FileText,
  GraduationCap,
  Archive,
  Folder,
  Activity,
  TrendingUp,
} from "lucide-react";
import type { CourseCategory, CourseTeacherRole } from "@prisma/client";
import { EditCourseButton } from "./_components/edit-course-button";
import { ArchiveCourseButton } from "./_components/archive-course-button";
import { AnnounceCourseButton } from "./_components/announce-course-button";
import { ClassesPanel } from "./_components/classes-panel";
import { CollaboratorsPanel } from "./_components/collaborators-panel";
import { ChaptersCard } from "./_components/chapters-card";
import { CourseAnalyticsCard } from "./_components/course-analytics-card";

export const metadata = { title: "课程详情" };

const CATEGORY_LABELS: Record<CourseCategory, string> = {
  DATA: "数据",
  ALGORITHM: "算法",
  AI: "人工智能",
  NETWORK: "计算机网络",
  INTERDISCIPLINARY: "多学科交叉",
};

const ROLE_LABELS: Record<CourseTeacherRole, { label: string; tone: "primary" | "accent" | "default" }> = {
  OWNER: { label: "主讲", tone: "primary" },
  ASSISTANT: { label: "助教", tone: "accent" },
  CONTRIBUTOR: { label: "外聘", tone: "default" },
};

export default async function TeacherCourseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userId = session!.user.id;

  // 教师权限：必须在 CourseTeacher 列表里
  const myMembership = await prisma.courseTeacher.findUnique({
    where: { courseId_teacherId: { courseId: id, teacherId: userId } },
  });
  if (!myMembership) {
    redirect("/t/courses?error=forbidden");
  }

  const course = await prisma.course.findUnique({
    where: { id },
    include: {
      classes: {
        include: {
          class: {
            include: {
              grade: { select: { name: true, joinYear: true } },
              _count: { select: { students: { where: { status: "ACTIVE" } } } },
            },
          },
        },
        orderBy: { addedAt: "asc" },
      },
      teachers: {
        include: {
          teacher: { select: { id: true, name: true, teacherNo: true, subjects: true, status: true } },
        },
        orderBy: [{ role: "asc" }, { addedAt: "asc" }],
      },
      chapters: {
        orderBy: { order: "asc" },
        include: {
          _count: { select: { assignments: true, exams: true } },
        },
      },
      _count: { select: { assignments: true, exams: true, resources: true } },
    },
  });

  if (!course) notFound();

  // 教师可添加的班级（自己任教且未加入此课程）
  const enrolledClassIds = new Set(course.classes.map((cc) => cc.classId));
  const taughtClasses = await prisma.classTeacher.findMany({
    where: { teacherId: userId },
    include: {
      class: {
        include: {
          grade: { select: { name: true } },
          _count: { select: { students: { where: { status: "ACTIVE" } } } },
        },
      },
    },
    orderBy: { class: { name: "asc" } },
  });
  const availableClasses = taughtClasses
    .filter((ct) => !enrolledClassIds.has(ct.classId))
    .map((ct) => ({
      id: ct.classId,
      name: ct.class.name,
      gradeName: ct.class.grade.name,
      studentCount: ct.class._count.students,
    }));

  // 可邀请的协作者（在职教师，且不在本课程团队中，且不是自己）
  const memberIds = new Set(course.teachers.map((ct) => ct.teacherId));
  const availableCollaborators = await prisma.user.findMany({
    where: {
      role: "TEACHER",
      status: "ACTIVE",
      NOT: { id: { in: [...memberIds] } },
    },
    select: { id: true, name: true, teacherNo: true, subjects: true },
    orderBy: { name: "asc" },
  });

  const isOwner = myMembership.role === "OWNER";
  // 课程公告收件人数：所有班级 ACTIVE 学生 + 同课程其他 CourseTeacher
  const recipientCount =
    course.classes.reduce((s, cc) => s + cc.class._count.students, 0) +
    Math.max(0, course.teachers.length - 1);

  // ========== 成绩分析数据 ==========
  // 学生（跨全部班级），作业 / 考试列表，全部提交 / attempts
  const courseClassIds = course.classes.map((cc) => cc.classId);
  const courseStudentList = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      role: "STUDENT",
      classId: { in: courseClassIds },
    },
    select: { id: true, name: true, studentNo: true },
    orderBy: [{ studentNo: "asc" }],
  });
  const courseStudentIds = courseStudentList.map((s) => s.id);
  const [
    assignmentAnalyticsList,
    examAnalyticsList,
    assignmentAnalyticsSubs,
    examAnalyticsAttempts,
  ] = await Promise.all([
    prisma.assignment.findMany({
      where: { courseId: id },
      select: {
        id: true,
        title: true,
        totalScore: true,
        dueAt: true,
        publishedAt: true,
      },
      orderBy: { dueAt: "desc" },
    }),
    prisma.exam.findMany({
      where: { courseId: id },
      select: {
        id: true,
        title: true,
        totalScore: true,
        openAt: true,
        status: true,
      },
      orderBy: { openAt: "desc" },
    }),
    courseStudentIds.length === 0
      ? Promise.resolve([])
      : prisma.assignmentSubmission.findMany({
          where: {
            studentId: { in: courseStudentIds },
            assignment: { courseId: id },
          },
          select: {
            assignmentId: true,
            studentId: true,
            finalScore: true,
            autoScore: true,
            manualScore: true,
            status: true,
          },
        }),
    courseStudentIds.length === 0
      ? Promise.resolve([])
      : prisma.examAttempt.findMany({
          where: {
            studentId: { in: courseStudentIds },
            exam: { courseId: id },
          },
          select: {
            examId: true,
            studentId: true,
            finalScore: true,
            autoScore: true,
            manualScore: true,
            status: true,
          },
        }),
  ]);

  // ========== 出勤统计（过去 7 天）==========
  const attendanceNow = new Date();
  const dayStart = new Date(attendanceNow);
  dayStart.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(attendanceNow);
  sevenDaysAgo.setDate(attendanceNow.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  // 课程下所有 ACTIVE 学生（应到）
  const expectedStudents = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      role: "STUDENT",
      classId: { in: course.classes.map((cc) => cc.classId) },
    },
    select: { id: true, name: true, studentNo: true },
    orderBy: [{ studentNo: "asc" }],
  });
  const expectedSet = new Set(expectedStudents.map((s) => s.id));
  const expectedTotal = expectedStudents.length;

  // 7 天内本课程所有访问日志
  const weekLogs = await prisma.accessLog.findMany({
    where: {
      courseId: id,
      createdAt: { gte: sevenDaysAgo },
    },
    select: { userId: true, createdAt: true },
  });

  // 按天分组（yyyy-mm-dd → Set<userId>）
  const dailyByDate = new Map<string, Set<string>>();
  const weeklyUsers = new Set<string>();
  const todayUsers = new Set<string>();
  for (const log of weekLogs) {
    const day = log.createdAt.toISOString().slice(0, 10);
    if (!dailyByDate.has(day)) dailyByDate.set(day, new Set());
    dailyByDate.get(day)!.add(log.userId);
    weeklyUsers.add(log.userId);
    if (log.createdAt >= dayStart) todayUsers.add(log.userId);
  }

  // 7 天 daily grid（按时间正序，今天在最右）
  const daily: { date: string; label: string; weekday: string; count: number; rate: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(attendanceNow);
    d.setDate(attendanceNow.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString().slice(0, 10);
    const users = dailyByDate.get(key) ?? new Set();
    daily.push({
      date: key,
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      weekday: ["日", "一", "二", "三", "四", "五", "六"][d.getDay()],
      count: users.size,
      rate: expectedTotal > 0 ? users.size / expectedTotal : 0,
    });
  }

  // 「今日到课」仅计本课程应到的学生
  const presentTodayCount = [...todayUsers].filter((uid) => expectedSet.has(uid)).length;
  // 7 天总到课人次（去重）
  const weeklyDistinctUsers = [...weeklyUsers].filter((uid) => expectedSet.has(uid)).length;
  // 7 天从未到过的本课程学生
  const absentInWeek = expectedStudents.filter((s) => !weeklyUsers.has(s.id));
  // 7 天平均出勤率（按天算，每天的到课学生数 / 应到）
  const avgRate =
    daily.length > 0
      ? daily.reduce((s, d) => s + d.rate, 0) / daily.length
      : 0;

  return (
    <>
      <Topbar
        crumbs={[
          { label: "我的课程", href: "/t/courses" },
          { label: course.title },
        ]}
      />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div>
            <Link
              href="/t/courses"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-3 w-3" />
              返回我的课程
            </Link>
            <div className="mt-2 flex items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-semibold tracking-tight">{course.title}</h1>
                  <Badge variant="primary">{CATEGORY_LABELS[course.category]}</Badge>
                  <Badge variant={ROLE_LABELS[myMembership.role].tone}>
                    {ROLE_LABELS[myMembership.role].label}
                  </Badge>
                  {course.isArchived && <Badge variant="default">已归档</Badge>}
                </div>
                {course.description && (
                  <p className="mt-2 text-sm text-muted-foreground">{course.description}</p>
                )}
              </div>
              <div className="flex gap-2">
                <AnnounceCourseButton
                  courseId={course.id}
                  courseTitle={course.title}
                  recipientCount={recipientCount}
                />
                <EditCourseButton
                  courseId={course.id}
                  initial={{
                    title: course.title,
                    description: course.description ?? "",
                    category: course.category,
                    semester: course.semester,
                  }}
                />
                {isOwner && (
                  <ArchiveCourseButton
                    courseId={course.id}
                    courseTitle={course.title}
                    isArchived={course.isArchived}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard icon={Users} label="绑定班级" value={course.classes.length} />
            <StatCard
              icon={GraduationCap}
              label="学生总数"
              value={course.classes.reduce((s, cc) => s + cc.class._count.students, 0)}
            />
            <StatCard icon={FileText} label="作业" value={course._count.assignments} />
            <StatCard icon={BookOpen} label="试卷" value={course._count.exams} />
          </div>

          {/* 学生出勤 */}
          <Card>
            <CardContent className="p-6">
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  <h2 className="text-base font-semibold">学生出勤</h2>
                </div>
                <div className="flex items-center gap-2">
                  {absentInWeek.length > 0 && (
                    <Badge variant="danger">{absentInWeek.length} 人 7 天未到</Badge>
                  )}
                  <Link
                    href={`/t/courses/${course.id}/attendance`}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs font-medium hover:bg-muted"
                  >
                    查看明细
                    <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <MiniStat label="今日到课" value={presentTodayCount} total={expectedTotal} tone="primary" />
                <MiniStat
                  label="7 天到课人次"
                  value={weeklyDistinctUsers}
                  total={expectedTotal}
                  tone="accent"
                />
                <MiniStat
                  label="7 天平均出勤率"
                  value={`${Math.round(avgRate * 100)}%`}
                  tone={avgRate >= 0.8 ? "success" : avgRate >= 0.6 ? "warning" : "danger"}
                />
                <MiniStat
                  label="缺勤学生（7 天）"
                  value={absentInWeek.length}
                  tone={absentInWeek.length === 0 ? "success" : "danger"}
                />
              </div>

              {/* 7 天 daily grid */}
              <div className="mt-6">
                <div className="mb-2 text-xs text-muted-foreground">
                  过去 7 天每日到课人数（应到 <span className="num text-foreground">{expectedTotal}</span>）
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {daily.map((d) => (
                    <DailyBar key={d.date} cell={d} />
                  ))}
                </div>
              </div>

              {/* 缺勤名单 */}
              {absentInWeek.length > 0 && (
                <div className="mt-6">
                  <div className="mb-2 text-xs text-muted-foreground">7 天未到过的学生</div>
                  <div className="flex flex-wrap gap-2">
                    {absentInWeek.map((s) => (
                      <span
                        key={s.id}
                        className="inline-flex items-center gap-1.5 rounded-md border border-danger/30 bg-danger-subtle/40 px-2 py-1 text-xs"
                      >
                        <span className="font-mono text-[10px] text-muted-foreground num">
                          {s.studentNo ?? "—"}
                        </span>
                        <span className="font-medium text-foreground">{s.name}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 成绩分析 */}
          <CourseAnalyticsCard
            students={courseStudentList}
            assignments={assignmentAnalyticsList.map((a) => ({
              id: a.id,
              title: a.title,
              totalScore: a.totalScore,
              dueAt: a.dueAt,
              status: a.publishedAt ? "PUBLISHED" : "DRAFT",
            }))}
            examList={examAnalyticsList.map((e) => ({
              id: e.id,
              title: e.title,
              totalScore: e.totalScore,
              openAt: e.openAt,
              status: e.status,
            }))}
            assignmentSubs={assignmentAnalyticsSubs}
            examAttempts={examAnalyticsAttempts}
          />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <ClassesPanel
                courseId={course.id}
                isOwner={isOwner}
                assigned={course.classes.map((cc) => ({
                  id: cc.classId,
                  name: cc.class.name,
                  gradeName: cc.class.grade.name,
                  gradeJoinYear: cc.class.grade.joinYear,
                  studentCount: cc.class._count.students,
                  addedAt: cc.addedAt,
                }))}
                available={availableClasses}
              />

              <ChaptersCard
                courseId={course.id}
                chapters={course.chapters.map((c) => ({
                  id: c.id,
                  title: c.title,
                  description: c.description,
                  order: c.order,
                  assignmentCount: c._count.assignments,
                  examCount: c._count.exams,
                }))}
                canEdit={isOwner || myMembership.role === "ASSISTANT"}
              />

              <Card>
                <CardContent className="p-6">
                  <h2 className="text-base font-semibold">课程成员</h2>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      href={`/t/courses/${course.id}/students`}
                      className="inline-flex h-9 items-center gap-1 rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted"
                    >
                      学生名单
                    </Link>
                    <Link
                      href={`/t/courses/${course.id}/resources`}
                      className="inline-flex h-9 items-center gap-1 rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted"
                    >
                      <Folder className="h-3.5 w-3.5 text-muted-foreground" />
                      资源管理
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <CollaboratorsPanel
                courseId={course.id}
                isOwner={isOwner}
                currentUserId={userId}
                members={course.teachers.map((ct) => ({
                  id: ct.teacher.id,
                  name: ct.teacher.name,
                  teacherNo: ct.teacher.teacherNo,
                  subjects: ct.teacher.subjects,
                  role: ct.role,
                  status: ct.teacher.status,
                }))}
                available={availableCollaborators}
              />

              {course.isArchived && (
                <Card>
                  <CardContent className="p-5 text-sm">
                    <div className="flex items-start gap-2 text-warning">
                      <Archive className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <p className="font-medium text-foreground">本课程已归档</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          归档后对学生不可见，历史作业与成绩保留。
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <span className="text-sm text-muted-foreground">{label}</span>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-subtle text-primary">
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3 text-3xl font-bold tracking-tight num">{value}</div>
      </CardContent>
    </Card>
  );
}

function MiniStat({
  label,
  value,
  total,
  tone = "muted",
}: {
  label: string;
  value: number | string;
  total?: number;
  tone?: "primary" | "accent" | "success" | "warning" | "danger" | "muted";
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
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={`inline-block h-2 w-2 rounded-full ${toneClass.split(" ")[0]}`} />
        <span className="text-xl font-semibold tracking-tight num text-foreground">
          {value}
        </span>
        {typeof total === "number" && (
          <span className="text-xs text-subtle-foreground num">/ {total}</span>
        )}
      </div>
    </div>
  );
}

function DailyBar({
  cell,
}: {
  cell: { date: string; label: string; weekday: string; count: number; rate: number };
}) {
  const heightPct = Math.max(8, Math.round(cell.rate * 100)); // 最低 8% 让无数据也有形
  const tone =
    cell.rate >= 0.8
      ? "bg-success/85"
      : cell.rate >= 0.6
        ? "bg-primary/80"
        : cell.rate >= 0.3
          ? "bg-warning/80"
          : cell.rate > 0
            ? "bg-danger/80"
            : "bg-muted-foreground/20";
  const isToday = cell.date === new Date().toISOString().slice(0, 10);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative flex h-20 w-full items-end justify-center overflow-hidden rounded-md bg-muted/40">
        <div
          className={`w-full ${tone} transition-all`}
          style={{ height: `${heightPct}%` }}
          title={`${cell.label}：${cell.count} 人到课`}
        />
      </div>
      <div className="flex flex-col items-center">
        <span className={`num text-sm font-semibold ${isToday ? "text-primary" : "text-foreground"}`}>
          {cell.count}
        </span>
        <span className="text-[10px] text-subtle-foreground num">
          {cell.weekday}
        </span>
      </div>
    </div>
  );
}