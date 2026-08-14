import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Topbar } from "@/components/shell/topbar";
import { Badge } from "@/components/ui/badge";
import { Users, GraduationCap, BookOpen, ChevronRight, FileText } from "lucide-react";

export const metadata = { title: "我的班级" };

export default async function TeacherClassesPage() {
  const session = await auth();
  const userId = session!.user.id;

  // 教师任教的班级
  const taughtClasses = await prisma.classTeacher.findMany({
    where: { teacherId: userId },
    include: {
      class: {
        include: {
          grade: { select: { name: true, joinYear: true } },
          _count: { select: { students: { where: { status: "ACTIVE" } } } },
          // 班级加入的课程（含主讲）
          courseClasses: {
            include: {
              course: {
                select: {
                  id: true,
                  title: true,
                  isArchived: true,
                  _count: { select: { assignments: true, exams: true } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { class: { name: "asc" } },
  });

  // 每个班级最近 7 天的作业提交数（用于活跃度）
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
  const recentSubs = await prisma.assignmentSubmission.findMany({
    where: {
      submittedAt: { gte: sevenDaysAgo },
      student: {
        classId: { in: taughtClasses.map((ct) => ct.classId) },
      },
    },
    select: { student: { select: { classId: true } } },
  });
  const submissionsByClass = new Map<string, number>();
  for (const s of recentSubs) {
    const cid = s.student.classId;
    if (cid) submissionsByClass.set(cid, (submissionsByClass.get(cid) ?? 0) + 1);
  }

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
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">我的班级</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              由管理员在「教师管理 → 分配班级」中分配。进入班级可查看花名册、近期作业表现与所属课程。
            </p>
          </div>

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
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {taughtClasses.map((ct) => {
                const c = ct.class;
                const activeCourses = c.courseClasses.filter((cc) => !cc.course.isArchived);
                const recentCount = submissionsByClass.get(c.id) ?? 0;
                return (
                  <Link
                    key={ct.classId}
                    href={`/t/classes/${c.id}`}
                    className="group block"
                  >
                    <Card className="h-full transition-all hover:border-primary hover:shadow-md">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-base font-semibold text-foreground">
                              {c.name}
                            </div>
                            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Badge variant="primary">{c.grade.name}</Badge>
                              <span className="num">{c.grade.joinYear} 级</span>
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-subtle-foreground transition-colors group-hover:text-primary" />
                        </div>

                        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-4">
                          <Mini icon={Users} label="学生" value={c._count.students} />
                          <Mini icon={BookOpen} label="课程" value={activeCourses.length} />
                          <Mini
                            icon={FileText}
                            label="本周提交"
                            value={recentCount}
                            accent={recentCount > 0}
                          />
                        </div>

                        {activeCourses.length > 0 && (
                          <div className="mt-3 line-clamp-2 text-[11px] text-muted-foreground">
                            <span className="text-foreground">课程：</span>
                            {activeCourses
                              .slice(0, 3)
                              .map((cc) => cc.course.title)
                              .join("、")}
                            {activeCourses.length > 3 && " 等"}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function Mini({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div
        className={`mt-0.5 text-lg font-semibold num ${
          accent ? "text-primary" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}