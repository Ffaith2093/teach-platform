import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Topbar } from "@/components/shell/topbar";
import { UserCog, Users, GraduationCap, Power } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CreateTeacherButton } from "./_components/create-teacher-button";
import { ToggleTeacherActiveButton } from "./_components/toggle-teacher-active-button";

export const metadata = { title: "教师管理" };

export default async function TeachersPage() {
  const [teachers, assignableClasses] = await Promise.all([
    prisma.user.findMany({
      where: { role: "TEACHER" },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      include: {
        _count: {
          select: {
            classTeachers: true,
            courseTeachers: true,
            authoredProblems: true,
          },
        },
      },
    }),
    // 给「新建教师」表单用：列出所有 ACTIVE 班级，含当前任课教师姓名
    prisma.class.findMany({
      where: { isActive: true },
      orderBy: [{ grade: { joinYear: "desc" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        grade: { select: { name: true } },
        teachers: { select: { teacher: { select: { name: true } } } },
      },
    }),
  ]);

  const [totalCount, activeCount, disabledCount, assignedClasses] = await Promise.all([
    prisma.user.count({ where: { role: "TEACHER" } }),
    prisma.user.count({ where: { role: "TEACHER", status: "ACTIVE" } }),
    prisma.user.count({ where: { role: "TEACHER", status: "DISABLED" } }),
    prisma.classTeacher.count(),
  ]);

  const stats = [
    { icon: UserCog, label: "教师总数", num: totalCount },
    { icon: Power, label: "在职", num: activeCount },
    { icon: UserCog, label: "已停用", num: disabledCount },
    { icon: GraduationCap, label: "已分配班级", num: assignedClasses, suffix: "个" },
  ];

  return (
    <>
      <Topbar crumbs={[{ label: "教师管理" }]} />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">教师管理</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                教师账号由管理员直接创建，初始密码由系统生成，教师首次登录强制修改。
                <br />
                一个班级<b className="text-foreground">只能由一位任课教师独占</b>，分配时自动顶替原教师。
              </p>
            </div>
            <CreateTeacherButton
              classes={assignableClasses.map((c) => ({
                id: c.id,
                name: c.name,
                gradeName: c.grade.name,
                teacherName: c.teachers[0]?.teacher.name ?? null,
              }))}
            />
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
              {teachers.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <UserCog className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">还没有任何教师</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      点击右上角「新建教师」创建第一位教师账号，并可一并勾选授课班级。
                    </p>
                  </div>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                      <th className="px-6 py-3">姓名 / 工号</th>
                      <th className="px-6 py-3">邮箱</th>
                      <th className="px-6 py-3">教学科目</th>
                      <th className="px-6 py-3">任课班级</th>
                      <th className="px-6 py-3">课程数</th>
                      <th className="px-6 py-3">状态</th>
                      <th className="px-6 py-3 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {teachers.map((t) => (
                      <tr key={t.id} className="transition-colors hover:bg-muted/30">
                        <td className="px-6 py-3.5">
                          <Link
                            href={`/admin/teachers/${t.id}`}
                            className="font-medium text-foreground transition-colors hover:text-primary"
                          >
                            {t.name}
                          </Link>
                          <div className="mt-0.5 num font-mono text-xs text-muted-foreground">
                            {t.teacherNo}
                          </div>
                        </td>
                        <td className="px-6 py-3.5 text-muted-foreground">{t.email}</td>
                        <td className="px-6 py-3.5">
                          {t.subjects.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {t.subjects.slice(0, 3).map((s) => (
                                <Badge key={s} variant="primary">
                                  {s}
                                </Badge>
                              ))}
                              {t.subjects.length > 3 && (
                                <span className="text-xs text-subtle-foreground">
                                  +{t.subjects.length - 3}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-subtle-foreground">—</span>
                          )}
                        </td>
                        <td className="px-6 py-3.5 num text-muted-foreground">
                          {t._count.classTeachers}
                        </td>
                        <td className="px-6 py-3.5 num text-muted-foreground">
                          {t._count.courseTeachers}
                        </td>
                        <td className="px-6 py-3.5">
                          {t.status === "ACTIVE" ? (
                            <Badge variant="success">在职</Badge>
                          ) : (
                            <Badge variant="default">已停用</Badge>
                          )}
                          {t.mustChangePassword && t.status === "ACTIVE" && (
                            <span className="ml-2 text-[11px] text-warning">· 未改密</span>
                          )}
                        </td>
                        <td className="px-6 py-3.5">
                          <div className="flex items-center justify-end gap-2">
                            <ToggleTeacherActiveButton
                              teacherId={t.id}
                              isActive={t.status === "ACTIVE"}
                              teacherName={t.name}
                            />
                            <Link
                              href={`/admin/teachers/${t.id}`}
                              className="rounded-md px-2.5 py-1 text-xs text-primary transition-colors hover:bg-primary-subtle"
                            >
                              详情 / 分配班级 →
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
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