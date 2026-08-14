import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Topbar } from "@/components/shell/topbar";
import { CreateGradeButton } from "./_components/create-grade-button";
import { ToggleGradeActiveButton } from "./_components/toggle-grade-active-button";
import { GraduationCap, Users, UserCheck, UserX } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "学生管理 · 年级" };

export default async function GradesPage() {
  await auth(); // layout 已做 role 守卫，这里只确保 session 存在

  const grades = await prisma.grade.findMany({
    orderBy: [{ order: "asc" }, { joinYear: "desc" }],
    include: {
      _count: { select: { classes: true } },
      classes: {
        where: { isActive: true },
        select: {
          _count: {
            select: { students: { where: { status: "ACTIVE" } } },
          },
        },
      },
    },
  });

  // 汇总统计
  const [totalGrades, activeGrades, totalClasses, totalStudents] = await Promise.all([
    prisma.grade.count(),
    prisma.grade.count({ where: { isActive: true } }),
    prisma.class.count({ where: { isActive: true } }),
    prisma.user.count({ where: { role: "STUDENT", status: "ACTIVE" } }),
  ]);

  const stats = [
    { icon: GraduationCap, label: "年级总数", num: totalGrades },
    { icon: UserCheck, label: "启用年级", num: activeGrades },
    { icon: Users, label: "班级总数", num: totalClasses },
    { icon: UserX, label: "在读学生", num: totalStudents, suffix: "人" },
  ];

  return (
    <>
      <Topbar crumbs={[{ label: "学生管理" }, { label: "年级" }]} />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">学生管理</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                组织结构：<b className="text-foreground">年级 → 班级 → 学生</b>。先维护年级，再为每个年级创建班级，最后向班级导入学生。
              </p>
            </div>
            <CreateGradeButton />
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
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

          <Card>
            <CardContent className="p-0">
              {grades.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <GraduationCap className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">还没有任何年级</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      点击右上角「新建年级」创建第一个年级（例如：2024 级 高一年级）。
                    </p>
                  </div>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                      <th className="px-6 py-3">年级名称</th>
                      <th className="px-6 py-3">入学年份</th>
                      <th className="px-6 py-3">班级数</th>
                      <th className="px-6 py-3">学生数</th>
                      <th className="px-6 py-3">状态</th>
                      <th className="px-6 py-3 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {grades.map((g) => {
                      const studentCount = g.classes.reduce(
                        (sum, c) => sum + c._count.students,
                        0,
                      );
                      return (
                        <tr key={g.id} className="transition-colors hover:bg-muted/30">
                          <td className="px-6 py-3.5">
                            <Link
                              href={`/admin/students/${g.id}`}
                              className="font-medium text-foreground transition-colors hover:text-primary"
                            >
                              {g.name}
                            </Link>
                          </td>
                          <td className="px-6 py-3.5 num text-muted-foreground">{g.joinYear}</td>
                          <td className="px-6 py-3.5 num text-muted-foreground">
                            {g._count.classes}
                          </td>
                          <td className="px-6 py-3.5 num text-muted-foreground">
                            {studentCount}
                          </td>
                          <td className="px-6 py-3.5">
                            {g.isActive ? (
                              <Badge variant="success">启用</Badge>
                            ) : (
                              <Badge variant="default">已停用</Badge>
                            )}
                          </td>
                          <td className="px-6 py-3.5">
                            <div className="flex items-center justify-end gap-2">
                              <ToggleGradeActiveButton
                                gradeId={g.id}
                                isActive={g.isActive}
                                gradeName={g.name}
                              />
                              <Link
                                href={`/admin/students/${g.id}`}
                                className="rounded-md px-2.5 py-1 text-xs text-primary transition-colors hover:bg-primary-subtle"
                              >
                                查看班级 →
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