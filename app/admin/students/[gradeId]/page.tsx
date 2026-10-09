import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Topbar } from "@/components/shell/topbar";
import { CreateClassButton } from "../_components/create-class-button";
import { DeleteClassButton } from "../_components/delete-class-button";
import { Badge } from "@/components/ui/badge";
import { Users, UserCheck, GraduationCap, ChevronLeft, Upload } from "lucide-react";
import { compareClassNames, formatGradeLabel } from "@/lib/grades";

export const metadata = { title: "学生管理 · 班级" };

export default async function ClassesPage({ params }: { params: Promise<{ gradeId: string }> }) {
  const { gradeId } = await params;

  const grade = await prisma.grade.findUnique({
    where: { id: gradeId },
    include: {
      classes: {
        orderBy: [{ joinYear: "desc" }, { name: "asc" }],
        include: {
          _count: {
            select: { students: { where: { status: "ACTIVE", role: "STUDENT" } } },
          },
          teachers: {
            include: { teacher: { select: { name: true, teacherNo: true } } },
          },
        },
      },
    },
  });

  if (!grade) notFound();

  grade.classes.sort((a, b) => compareClassNames(a.name, b.name));

  const totalStudents = grade.classes.reduce((sum, c) => sum + c._count.students, 0);
  const classesWithTeacher = grade.classes.filter((c) => c.teachers.length > 0).length;

  const stats = [
    { icon: Users, label: "班级数", num: grade.classes.length },
    { icon: UserCheck, label: "已分配教师", num: classesWithTeacher },
    { icon: GraduationCap, label: "在读学生", num: totalStudents, suffix: "人" },
  ];

  return (
    <>
      <Topbar crumbs={[{ label: "学生管理", href: "/admin/students" }, { label: grade.name }]} />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <Link
                href="/admin/students"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronLeft className="h-3 w-3" />
                返回年级列表
              </Link>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">
                {formatGradeLabel(grade.name, grade.joinYear)}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {grade.isActive
                  ? "此年级当前启用。创建班级并向班级导入学生后，学生登录即可看到自己班级所属课程。"
                  : "此年级已停用，下属班级也无法被选入课程。"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/admin/students/${grade.id}/import`}
                className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium transition-colors hover:bg-muted ${!grade.isActive || grade.classes.length === 0 ? "pointer-events-none opacity-50" : ""}`}
              >
                <Upload className="h-4 w-4" />
                批量导入全年级
              </Link>
              <CreateClassButton gradeId={grade.id} disabled={!grade.isActive} />
            </div>
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
                      <span className="num text-3xl font-bold tracking-tight">{s.num}</span>
                      {s.suffix && (
                        <span className="text-sm text-muted-foreground">{s.suffix}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardContent className="p-0">
              {grade.classes.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      「{grade.name}」还没有任何班级
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      点击右上角「新建班级」创建第一个班级（例如：高一(1)班）。
                    </p>
                  </div>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                      <th className="px-6 py-3">班级名称</th>
                      <th className="px-6 py-3">入学年份</th>
                      <th className="px-6 py-3">任课教师</th>
                      <th className="px-6 py-3">学生数</th>
                      <th className="px-6 py-3">状态</th>
                      <th className="px-6 py-3 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {grade.classes.map((c) => {
                      const teacher = c.teachers[0]?.teacher;
                      return (
                        <tr key={c.id} className="transition-colors hover:bg-muted/30">
                          <td className="px-6 py-3.5">
                            <Link
                              href={`/admin/students/${grade.id}/${c.id}`}
                              className="font-medium text-foreground transition-colors hover:text-primary"
                            >
                              {c.name}
                            </Link>
                          </td>
                          <td className="num px-6 py-3.5 text-muted-foreground">{c.joinYear}</td>
                          <td className="px-6 py-3.5 text-muted-foreground">
                            {teacher ? (
                              <span className="inline-flex items-center gap-1.5">
                                <span className="text-foreground">{teacher.name}</span>
                                <span className="num text-xs">·</span>
                                <span className="num text-xs">{teacher.teacherNo}</span>
                              </span>
                            ) : (
                              <span className="text-xs text-subtle-foreground">未分配</span>
                            )}
                          </td>
                          <td className="num px-6 py-3.5 text-muted-foreground">
                            {c._count.students}
                          </td>
                          <td className="px-6 py-3.5">
                            {c.isActive ? (
                              <Badge variant="success">启用</Badge>
                            ) : (
                              <Badge variant="default">已停用</Badge>
                            )}
                          </td>
                          <td className="px-6 py-3.5">
                            <div className="flex items-center justify-end gap-2">
                              <DeleteClassButton
                                gradeId={grade.id}
                                classId={c.id}
                                className={c.name}
                                studentCount={c._count.students}
                              />
                              <Link
                                href={`/admin/students/${grade.id}/${c.id}`}
                                className="rounded-md px-2.5 py-1 text-xs text-primary transition-colors hover:bg-primary-subtle"
                              >
                                查看学生 →
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
