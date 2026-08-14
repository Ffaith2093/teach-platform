import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  GraduationCap,
  FileText,
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  BookOpen,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "课程概览" };

export default async function StudentCourseOverviewPage({
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
  if (!me?.classId) notFound();

  // 课程 + 教师 + 班级 + 我的进度
  const [course, mySubmissions, myAttempts] = await Promise.all([
    prisma.course.findFirst({
      where: {
        id,
        isArchived: false,
        classes: { some: { classId: me.classId } },
      },
      include: {
        teachers: {
          include: { teacher: { select: { id: true, name: true, email: true } } },
          orderBy: [{ role: "asc" }],
        },
        classes: {
          include: {
            class: {
              include: { grade: { select: { name: true, joinYear: true } } },
            },
          },
        },
      },
    }),
    prisma.assignmentSubmission.findMany({
      where: { studentId: userId, assignment: { courseId: id } },
      select: { status: true, finalScore: true, assignment: { select: { totalScore: true } } },
    }),
    prisma.examAttempt.findMany({
      where: { studentId: userId, exam: { courseId: id } },
      select: { status: true },
    }),
  ]);
  if (!course) notFound();

  // 进度统计
  const gradedSubs = mySubmissions.filter((s) => s.status === "GRADED");
  const avgRatio =
    gradedSubs.length === 0
      ? null
      : gradedSubs.reduce((acc, s) => acc + (s.finalScore ?? 0) / (s.assignment.totalScore || 1), 0) /
        gradedSubs.length;

  const teacherCount = course.teachers.length;
  const classCount = course.classes.length;

  const roleLabel = (role: string) =>
    role === "OWNER" ? "主讲" : role === "ASSISTANT" ? "助教" : "外聘";

  return (
    <div className="space-y-6">
      {/* 进度三卡 */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <span className="text-sm text-muted-foreground">平均成绩</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 text-3xl font-bold tracking-tight num">
              {avgRatio == null ? "—" : `${Math.round(avgRatio * 100)}%`}
            </div>
            <p className="mt-1 text-xs text-subtle-foreground">
              {gradedSubs.length === 0 ? "暂无已批改作业" : `基于 ${gradedSubs.length} 次作业`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <span className="text-sm text-muted-foreground">参与班级</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-subtle text-accent">
                <Users className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 text-3xl font-bold tracking-tight num">{classCount}</div>
            <p className="mt-1 text-xs text-subtle-foreground">本课程关联班级</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <span className="text-sm text-muted-foreground">考试场次</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning-subtle text-warning">
                <GraduationCap className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 text-3xl font-bold tracking-tight num">{myAttempts.length}</div>
            <p className="mt-1 text-xs text-subtle-foreground">我参加过的考试</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* 教师列表 */}
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <h2 className="mb-4 text-base font-semibold">任课教师</h2>
            {course.teachers.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
                暂无教师信息
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {course.teachers.map((t) => (
                  <li key={t.id} className="flex items-center gap-4 py-3.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-sm font-semibold text-white">
                      {t.teacher.name.slice(0, 1)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-medium">{t.teacher.name}</div>
                        <Badge variant={t.role === "OWNER" ? "primary" : "default"}>
                          {roleLabel(t.role)}
                        </Badge>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">{t.teacher.email}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* 班级列表 */}
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-4 text-base font-semibold">参与班级</h2>
            {course.classes.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
                暂无班级
              </p>
            ) : (
              <ul className="space-y-2.5">
                {course.classes.map((cc) => (
                  <li
                    key={cc.id}
                    className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3.5 py-2.5"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                      <Users className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {cc.class.grade.name} · {cc.class.name}
                      </div>
                      <div className="text-[11px] text-subtle-foreground">
                        {cc.class.grade.joinYear} 级
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 快捷入口 */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href={`/courses/${id}/resources`} className="group">
          <Card className="transition-all hover:border-primary/40">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-subtle text-primary">
                <BookOpen className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">课程资源</div>
                <div className="mt-0.5 text-xs text-muted-foreground">课件、讲义、参考资料下载</div>
              </div>
              <ChevronRight className="h-4 w-4 text-subtle-foreground transition-colors group-hover:text-primary" />
            </CardContent>
          </Card>
        </Link>
        <Link href={`/assignments?course=${id}`} className="group">
          <Card className="transition-all hover:border-primary/40">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-warning-subtle text-warning">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">作业与考试</div>
                <div className="mt-0.5 text-xs text-muted-foreground">查看本课程的考核任务</div>
              </div>
              <ChevronRight className="h-4 w-4 text-subtle-foreground transition-colors group-hover:text-primary" />
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* 公告占位（Notification API 未上线） */}
      <Card>
        <CardContent className="flex items-center gap-4 p-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Clock className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">课程公告</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              班级公告系统正在搭建中，届时教师发布的公告会显示在这里。
            </p>
          </div>
          <AlertCircle className="h-4 w-4 text-subtle-foreground" />
        </CardContent>
      </Card>
    </div>
  );
}