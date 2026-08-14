import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Topbar } from "@/components/shell/topbar";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Users, GraduationCap, Search } from "lucide-react";

export const metadata = { title: "选班学生" };

export default async function CourseStudentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; classId?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await auth();
  const userId = session!.user.id;

  // 权限校验
  const myMembership = await prisma.courseTeacher.findUnique({
    where: { courseId_teacherId: { courseId: id, teacherId: userId } },
  });
  if (!myMembership) redirect("/t/courses?error=forbidden");

  const course = await prisma.course.findUnique({
    where: { id },
    include: {
      classes: {
        include: {
          class: {
            include: {
              grade: { select: { name: true, joinYear: true } },
              students: {
                where: { status: "ACTIVE", role: "STUDENT" },
                select: {
                  id: true,
                  name: true,
                  studentNo: true,
                  email: true,
                  mustChangePassword: true,
                },
                orderBy: { studentNo: "asc" },
              },
            },
          },
        },
        orderBy: { addedAt: "asc" },
      },
    },
  });
  if (!course) notFound();

  const allStudents = course.classes.flatMap((cc) =>
    cc.class.students.map((s) => ({
      ...s,
      classId: cc.classId,
      className: cc.class.name,
      gradeName: cc.class.grade.name,
    })),
  );

  const filteredClassId = sp.classId;
  const query = sp.q?.trim() ?? "";

  const visibleStudents = allStudents.filter((s) => {
    if (filteredClassId && s.classId !== filteredClassId) return false;
    if (query) {
      const q = query.toLowerCase();
      if (
        !s.name.toLowerCase().includes(q) &&
        !(s.studentNo ?? "").toLowerCase().includes(q) &&
        !s.email.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  // 按班级分组（即使有筛选也按班级排序展示）
  const groupedByClass = course.classes
    .map((cc) => ({
      classId: cc.classId,
      className: cc.class.name,
      gradeName: cc.class.grade.name,
      joinYear: cc.class.grade.joinYear,
      students: visibleStudents.filter((s) => s.classId === cc.classId),
    }))
    .filter((g) => (filteredClassId ? g.classId === filteredClassId : true));

  return (
    <>
      <Topbar
        crumbs={[
          { label: "我的课程", href: "/t/courses" },
          { label: course.title, href: `/t/courses/${course.id}` },
          { label: "选班学生" },
        ]}
      />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div>
            <Link
              href={`/t/courses/${course.id}`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-3 w-3" />
              返回课程详情
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              {course.title} · 选班学生
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              学生通过班级归属自动加入本课程。共{" "}
              <b className="text-foreground num">{allStudents.length}</b> 名学生，
              分布于 <b className="text-foreground num">{course.classes.length}</b> 个班级。
            </p>
          </div>

          {/* 筛选条 */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">班级：</span>
              <Link
                href={`/t/courses/${course.id}/students${query ? `?q=${query}` : ""}`}
                className={`rounded-md px-2 py-1 text-xs ${
                  !filteredClassId
                    ? "bg-primary-subtle font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                全部
              </Link>
              {course.classes.map((cc) => {
                const active = filteredClassId === cc.classId;
                return (
                  <Link
                    key={cc.classId}
                    href={`/t/courses/${course.id}/students?classId=${cc.classId}${query ? `&q=${query}` : ""}`}
                    className={`rounded-md px-2 py-1 text-xs ${
                      active
                        ? "bg-primary-subtle font-medium text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {cc.class.name}
                  </Link>
                );
              })}
            </div>
            <form className="ml-auto flex w-full max-w-xs items-center gap-2">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
                <input
                  name="q"
                  defaultValue={query}
                  placeholder="按姓名/学号/邮箱筛选…"
                  className="flex h-9 w-full rounded-lg border border-border bg-muted pl-9 pr-3 text-sm focus-visible:border-primary focus-visible:bg-card focus-visible:outline-none"
                />
              </div>
              {filteredClassId && (
                <input type="hidden" name="classId" value={filteredClassId} />
              )}
            </form>
          </div>

          {groupedByClass.length === 0 || visibleStudents.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <Users className="h-10 w-10 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {query ? "没有匹配的学生" : "本课程尚未绑定任何班级"}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {groupedByClass.map((g) => (
                <Card key={g.classId}>
                  <CardContent className="p-0">
                    <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-6 py-3">
                      <div className="flex items-center gap-2">
                        <GraduationCap className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium text-foreground">
                          {g.className}
                        </span>
                        <Badge variant="primary">{g.gradeName}</Badge>
                        <span className="num text-xs text-muted-foreground">
                          · {g.joinYear} 级
                        </span>
                      </div>
                      <span className="num text-xs text-muted-foreground">
                        {g.students.length} 名学生
                      </span>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/30 text-left text-xs font-medium text-muted-foreground">
                          <th className="px-6 py-2.5">学号</th>
                          <th className="px-6 py-2.5">姓名</th>
                          <th className="px-6 py-2.5">邮箱</th>
                          <th className="px-6 py-2.5">状态</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {g.students.map((s) => (
                          <tr key={s.id} className="transition-colors hover:bg-muted/20">
                            <td className="px-6 py-2.5 num font-mono text-xs text-muted-foreground">
                              {s.studentNo}
                            </td>
                            <td className="px-6 py-2.5 font-medium text-foreground">{s.name}</td>
                            <td className="px-6 py-2.5 text-muted-foreground">{s.email}</td>
                            <td className="px-6 py-2.5">
                              {s.mustChangePassword ? (
                                <span className="text-[11px] text-warning">未改密</span>
                              ) : (
                                <span className="text-[11px] text-success">正常</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}