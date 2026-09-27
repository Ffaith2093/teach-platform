import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Topbar } from "@/components/shell/topbar";
import { Users, GraduationCap, BookOpen, ChevronRight } from "lucide-react";

export const metadata = { title: "我的班级" };

export default async function TeacherClassesPage() {
  const session = await auth();
  const userId = session!.user.id;

  // 教师任教的班级（精简字段，去掉 courseClasses / 课程统计）
  const taughtClasses = await prisma.classTeacher.findMany({
    where: { teacherId: userId },
    include: {
      class: {
        include: {
          grade: { select: { name: true, joinYear: true } },
          _count: { select: { students: { where: { status: "ACTIVE" } } } },
        },
      },
    },
    orderBy: { class: { name: "asc" } },
  });

  const [classCount, studentCount, courseCount] = await Promise.all([
    prisma.classTeacher.count({ where: { teacherId: userId } }),
    prisma.user.count({
      where: {
        classId: { in: taughtClasses.map((ct) => ct.classId) },
        status: "ACTIVE",
        role: "STUDENT",
      },
    }),
    prisma.course.count({
      where: {
        classes: { some: { classId: { in: taughtClasses.map((ct) => ct.classId) } } },
        teachers: { some: { teacherId: userId } },
      },
    }),
  ]);

  const stats = [
    { icon: GraduationCap, label: "我教的班级", num: classCount },
    { icon: Users, label: "学生总数", num: studentCount, suffix: "人" },
    { icon: BookOpen, label: "关联课程", num: courseCount },
  ];

  return (
    <>
      <Topbar crumbs={[{ label: "我的班级" }]} />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <h1 className="text-2xl font-semibold tracking-tight">我的班级</h1>

          <div className="grid grid-cols-3 gap-4">
            {stats.map((s) => {
              const Icon = s.icon;
              return (
                <Card key={s.label}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <span className="text-sm text-muted-foreground">{s.label}</span>
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-subtle text-primary">
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

          {taughtClasses.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">尚未被分配任何班级</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    请联系管理员在「教师管理」中为您分配授课班级
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {taughtClasses.map((ct) => {
                const c = ct.class;
                return (
                  <li key={ct.classId}>
                    <Link
                      href={`/t/classes/${c.id}`}
                      className="group flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-muted/30"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground">{c.name}</div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="primary">{c.grade.name}</Badge>
                          <span className="num">{c.grade.joinYear}</span> 级
                          <span className="num">{c._count.students}</span> 人
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-subtle-foreground transition-colors group-hover:text-primary" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
    </>
  );
}