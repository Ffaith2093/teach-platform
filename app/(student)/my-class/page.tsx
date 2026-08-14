import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Topbar } from "@/components/shell/topbar";
import { Users, GraduationCap, BookOpen, ChevronRight } from "lucide-react";

export const metadata = { title: "我的班级" };

export default async function MyClassPage() {
  const session = await auth();
  const userId = session!.user.id;

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { classId: true, studentNo: true },
  });
  if (!me?.classId) redirect("/dashboard");

  const cls = await prisma.class.findUnique({
    where: { id: me.classId },
    include: {
      grade: { select: { id: true, name: true, joinYear: true } },
      teachers: {
        include: { teacher: { select: { id: true, name: true, email: true } } },
      },
      students: {
        where: { role: "STUDENT", status: "ACTIVE" },
        orderBy: [{ studentNo: "asc" }],
        select: { id: true, name: true, studentNo: true },
      },
      courseClasses: {
        select: {
          course: {
            select: { id: true, title: true, category: true },
          },
        },
      },
    },
  });
  if (!cls) redirect("/dashboard");

  const headTeacher = cls.teachers[0]?.teacher ?? null;
  const studentCount = cls.students.length;
  const courseCount = cls.courseClasses.length;

  // 当前学期：取本班课程中学期最大的一个（实际学期由所有课程聚合）
  const semesters = await prisma.course.findMany({
    where: {
      isArchived: false,
      classes: { some: { classId: cls.id } },
    },
    select: { semester: true },
    distinct: ["semester"],
  });
  const currentSemester = semesters[0]?.semester ?? `${cls.grade.joinYear} 级`;

  return (
    <>
      <Topbar crumbs={[{ label: "我的班级" }]} />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {cls.grade.name} · {cls.name}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {currentSemester} · {cls.grade.joinYear} 级入学 · 共 {studentCount} 位同学
            </p>
          </div>

          {/* 概览小卡 */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                  <GraduationCap className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">任课教师</div>
                  <div className="num mt-0.5 text-xl font-semibold">
                    {headTeacher ? headTeacher.name : "—"}
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-subtle text-accent">
                  <Users className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">班级人数</div>
                  <div className="num mt-0.5 text-xl font-semibold">{studentCount}</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-subtle text-success">
                  <BookOpen className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">参与课程</div>
                  <div className="num mt-0.5 text-xl font-semibold">{courseCount}</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 班主任 */}
          <Card>
            <CardContent className="p-6">
              <h2 className="mb-4 text-base font-semibold">任课教师</h2>
              {headTeacher ? (
                <div className="flex items-center gap-4 rounded-xl border border-border bg-muted/30 px-5 py-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-base font-semibold text-white">
                    {headTeacher.name.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold">{headTeacher.name}</div>
                      <Badge variant="primary">任课教师</Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{headTeacher.email}</div>
                  </div>
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
                  本班暂未分配任课教师
                </p>
              )}
            </CardContent>
          </Card>

          {/* 同学名单 */}
          <Card>
            <CardContent className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold">同学名单</h2>
                <span className="text-xs text-muted-foreground">
                  按学号排序 · 共 <span className="num">{studentCount}</span> 人
                </span>
              </div>
              {studentCount === 0 ? (
                <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
                  本班暂无同学
                </p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {cls.students.map((s) => {
                    const isMe = s.id === userId;
                    return (
                      <li
                        key={s.id}
                        className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                          isMe
                            ? "border-primary/40 bg-primary-subtle/40"
                            : "border-border bg-card"
                        }`}
                      >
                        <div
                          className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${
                            isMe
                              ? "bg-primary text-primary-foreground"
                              : "bg-gradient-to-br from-primary/70 to-accent/70 text-white"
                          }`}
                        >
                          {s.name.slice(0, 1)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div className="truncate text-sm font-medium">{s.name}</div>
                            {isMe && (
                              <Badge variant="primary" className="px-1.5 py-0 text-[10px]">
                                我
                              </Badge>
                            )}
                          </div>
                          <div className="mt-0.5 text-xs text-subtle-foreground num">
                            {s.studentNo}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* 本班课程列表（点击跳 /courses） */}
          {courseCount > 0 && (
            <Card>
              <CardContent className="p-6">
                <h2 className="mb-4 text-base font-semibold">本班参与课程</h2>
                <ul className="divide-y divide-border">
                  {cls.courseClasses.map((cc) => (
                    <li key={cc.course.id}>
                      <a
                        href={`/courses/${cc.course.id}`}
                        className="flex items-center gap-3 py-3 transition-colors hover:bg-muted/40 -mx-2 px-2 rounded-lg"
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                          <BookOpen className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{cc.course.title}</div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-subtle-foreground" />
                      </a>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </>
  );
}