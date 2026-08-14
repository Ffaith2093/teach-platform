import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Topbar } from "@/components/shell/topbar";
import { Users, FileText, ClipboardCheck, BookOpen, ChevronRight } from "lucide-react";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "教师工作台" };

export default async function TeacherDashboardPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [classCount, courseCount, toGrade, recentSubs, taughtClasses, myCourses] =
    await Promise.all([
      prisma.classTeacher.count({ where: { teacherId: userId } }),
      prisma.courseTeacher.count({ where: { teacherId: userId } }),
      prisma.assignmentSubmission.count({
        where: {
          status: "SUBMITTED",
          gradedById: null,
          assignment: { course: { teachers: { some: { teacherId: userId } } } },
        },
      }),
      prisma.submission.findMany({
        where: {
          userId,
          contextType: "ASSIGNMENT",
          createdAt: { gte: new Date(Date.now() - 7 * 86400000) },
        },
        take: 5,
        orderBy: { createdAt: "desc" },
      }),
      prisma.classTeacher.findMany({
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
      }),
      prisma.courseTeacher.findMany({
        where: { teacherId: userId, course: { isArchived: false } },
        include: {
          course: {
            include: { _count: { select: { classes: true, assignments: true } } },
          },
        },
        take: 5,
        orderBy: { course: { updatedAt: "desc" } },
      }),
    ]);

  const stats = [
    { icon: Users, label: "我教的班级", num: classCount, suffix: "个" },
    { icon: BookOpen, label: "我的课程", num: courseCount },
    { icon: ClipboardCheck, label: "待批改", num: toGrade, accent: true },
    { icon: FileText, label: "本周提交", num: recentSubs.length },
  ];

  return (
    <>
      <Topbar crumbs={[{ label: "工作台" }]} />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {session?.user.name} 老师
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">欢迎回到 PyLearn 教师端</p>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {stats.map((s) => {
              const Icon = s.icon;
              return (
                <Card
                  key={s.label}
                  className={s.accent ? "border-warning/40 hover:shadow-md" : "hover:border-primary/40 hover:shadow-md"}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <span className="text-sm text-muted-foreground">{s.label}</span>
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                          s.accent ? "bg-warning-subtle text-warning" : "bg-primary-subtle text-primary"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="mt-3 flex items-baseline gap-1">
                      <span className="text-3xl font-bold tracking-tight num">{s.num}</span>
                      {s.suffix && (
                        <span className="text-sm text-muted-foreground">{s.suffix}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold">我教的班级</h2>
                    <Link
                      href="/t/classes"
                      className="text-xs text-muted-foreground transition-colors hover:text-primary"
                    >
                      全部班级 →
                    </Link>
                  </div>
                  {taughtClasses.length === 0 ? (
                    <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-10 text-center text-sm text-muted-foreground">
                      <Users className="mx-auto h-6 w-6 text-subtle-foreground" />
                      <p className="mt-2">管理员尚未为您分配任何授课班级</p>
                      <p className="mt-1 text-xs text-subtle-foreground">
                        请联系管理员在「教师管理 → 分配班级」中添加
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {taughtClasses.slice(0, 6).map((ct) => (
                        <Link
                          key={ct.classId}
                          href={`/t/classes/${ct.classId}`}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 transition-all hover:border-primary hover:shadow-sm"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-foreground">
                              {ct.class.name}
                            </div>
                            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Badge variant="primary">{ct.class.grade.name}</Badge>
                              <span className="num">{ct.class._count.students} 名学生</span>
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-subtle-foreground" />
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold">最近课程</h2>
                    <Link
                      href="/t/courses"
                      className="text-xs text-muted-foreground transition-colors hover:text-primary"
                    >
                      全部课程 →
                    </Link>
                  </div>
                  {myCourses.length === 0 ? (
                    <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-10 text-center text-sm text-muted-foreground">
                      <BookOpen className="mx-auto h-6 w-6 text-subtle-foreground" />
                      <p className="mt-2">还没有任何课程</p>
                      <Link
                        href="/t/courses/new"
                        className="mt-3 inline-block text-xs text-primary hover:underline"
                      >
                        创建第一门课程 →
                      </Link>
                    </div>
                  ) : (
                    <ul className="mt-4 space-y-2">
                      {myCourses.map((ct) => (
                        <li key={ct.course.id}>
                          <Link
                            href={`/t/courses/${ct.course.id}`}
                            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/40"
                          >
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-foreground">
                                {ct.course.title}
                              </div>
                              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Badge
                                  variant={ct.role === "OWNER" ? "primary" : "accent"}
                                >
                                  {ct.role === "OWNER" ? "主讲" : ct.role === "ASSISTANT" ? "助教" : "外聘"}
                                </Badge>
                                <span className="num">{ct.course._count.classes} 班</span>
                                <span>·</span>
                                <span className="num">{ct.course._count.assignments} 作业</span>
                                <span>·</span>
                                <span>{ct.course.semester}</span>
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 shrink-0 text-subtle-foreground" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardContent className="p-6">
                  <h2 className="text-base font-semibold">待批改</h2>
                  {toGrade === 0 ? (
                    <div className="mt-4 flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
                      <ClipboardCheck className="h-6 w-6 text-success" />
                      <p>暂无待批改作业</p>
                    </div>
                  ) : (
                    <Link
                      href="/t/grading"
                      className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning-subtle/30 p-3 transition-colors hover:bg-warning-subtle/50"
                    >
                      <div>
                        <div className="text-2xl font-bold num text-warning">{toGrade}</div>
                        <p className="mt-0.5 text-xs text-muted-foreground">份已提交未批改</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-warning" />
                    </Link>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <h2 className="text-base font-semibold">本周动态</h2>
                  {recentSubs.length === 0 ? (
                    <div className="mt-4 py-6 text-center text-sm text-muted-foreground">
                      暂无提交动态
                    </div>
                  ) : (
                    <ul className="mt-4 space-y-3 text-sm">
                      {recentSubs.map((s) => (
                        <li key={s.id} className="flex items-start gap-2">
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs">
                              学生提交了 <span className="font-medium text-foreground">编程题 #{s.problemId.slice(-4)}</span>
                            </div>
                            <div className="text-[11px] text-subtle-foreground">
                              {relativeTime(s.createdAt)} · {s.status}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}