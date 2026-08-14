import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Topbar } from "@/components/shell/topbar";
import { BookOpen, ChevronRight, GraduationCap, FileText, Users } from "lucide-react";
import type { CourseCategory } from "@prisma/client";

export const metadata = { title: "我的课程" };

const CATEGORY_LABELS: Record<CourseCategory, string> = {
  DATA: "数据",
  ALGORITHM: "算法",
  AI: "人工智能",
  NETWORK: "计算机网络",
  INTERDISCIPLINARY: "多学科交叉",
};

const CATEGORY_GRADIENT: Record<CourseCategory, string> = {
  DATA: "from-sky-400 to-blue-500",
  ALGORITHM: "from-violet-400 to-purple-500",
  AI: "from-emerald-400 to-teal-500",
  NETWORK: "from-orange-400 to-rose-500",
  INTERDISCIPLINARY: "from-pink-400 to-fuchsia-500",
};

export default async function StudentCoursesPage() {
  const session = await auth();
  const userId = session!.user.id;
  const now = new Date();

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { classId: true },
  });
  if (!me?.classId) redirect("/dashboard");

  // 学生所在班级所属的课程
  const courses = await prisma.course.findMany({
    where: {
      isArchived: false,
      classes: { some: { classId: me.classId } },
    },
    orderBy: [{ category: "asc" }, { createdAt: "desc" }],
    include: {
      teachers: {
        include: { teacher: { select: { id: true, name: true } } },
        orderBy: [{ role: "asc" }],
      },
      _count: { select: { classes: true, assignments: true, exams: true, resources: true } },
    },
  });

  if (courses.length === 0) {
    return (
      <>
        <Topbar crumbs={[{ label: "我的课程" }]} />
        <main className="flex-1 p-8">
          <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">我的课程</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                自动按您所在班级归属展示，无需加入。
              </p>
            </div>
            <Card>
              <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">您所在的班级尚未加入任何课程</p>
                  <p className="mt-1 text-xs text-muted-foreground">请联系管理员把班级分配到课程后再来查看。</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </>
    );
  }

  // 每门课的待办 / 进行中统计（4 个并行）
  const stats = await Promise.all(
    courses.map(async (c) => {
      const [pendingAssignments, inProgressExams] = await Promise.all([
        prisma.assignment.count({
          where: {
            courseId: c.id,
            publishedAt: { not: null },
            dueAt: { gte: now },
            submissions: {
              none: { studentId: userId, status: { in: ["GRADED", "RETURNED"] } },
            },
          },
        }),
        prisma.examAttempt.count({
          where: {
            studentId: userId,
            status: "IN_PROGRESS",
            deadlineAt: { gt: now },
            exam: { courseId: c.id },
          },
        }),
      ]);
      return { courseId: c.id, pendingAssignments, inProgressExams };
    }),
  );
  const statMap = new Map(stats.map((s) => [s.courseId, s]));

  return (
    <>
      <Topbar crumbs={[{ label: "我的课程" }]} />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">我的课程</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              共 <span className="num">{courses.length}</span> 门 · 自动按您所在班级归属展示
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((c) => {
              const s = statMap.get(c.id)!;
              const totalTodo = s.pendingAssignments + s.inProgressExams;
              return (
                <Link key={c.id} href={`/courses/${c.id}`} className="group">
                  <Card className="h-full transition-all hover:border-primary/40 hover:shadow-sm">
                    <CardContent className="p-0">
                      <div
                        className={`relative h-28 rounded-t-xl bg-gradient-to-br ${
                          CATEGORY_GRADIENT[c.category]
                        } px-5 pt-5`}
                      >
                        <Badge variant="default" className="bg-white/90 text-foreground backdrop-blur">
                          {CATEGORY_LABELS[c.category]}
                        </Badge>
                        {totalTodo > 0 && (
                          <Badge variant="warning" className="absolute right-4 top-4">
                            {totalTodo} 项待办
                          </Badge>
                        )}
                      </div>
                      <div className="space-y-3 p-5">
                        <div>
                          <h3 className="line-clamp-1 text-[15px] font-semibold tracking-tight text-foreground group-hover:text-primary">
                            {c.title}
                          </h3>
                          <p className="mt-1 text-xs text-muted-foreground">{c.semester}</p>
                        </div>
                        {c.description && (
                          <p className="line-clamp-2 text-xs text-muted-foreground">{c.description}</p>
                        )}
                        <div className="flex items-center gap-3 pt-2 text-xs text-subtle-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {c._count.classes} 个班
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            {c._count.assignments} 项作业
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <GraduationCap className="h-3 w-3" />
                            {c._count.exams} 场考试
                          </span>
                        </div>
                        <div className="-mx-5 -mb-5 mt-3 flex items-center justify-between border-t border-border px-5 py-3">
                          <div className="flex -space-x-2">
                            {c.teachers.slice(0, 3).map((t) => (
                              <div
                                key={t.id}
                                title={t.teacher.name}
                                className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-gradient-to-br from-primary to-accent text-[11px] font-semibold text-white"
                              >
                                {t.teacher.name.slice(0, 1)}
                              </div>
                            ))}
                            {c.teachers.length > 3 && (
                              <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-muted text-[10px] font-medium text-muted-foreground">
                                +{c.teachers.length - 3}
                              </div>
                            )}
                          </div>
                          <ChevronRight className="h-4 w-4 text-subtle-foreground transition-colors group-hover:text-primary" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      </main>
    </>
  );
}