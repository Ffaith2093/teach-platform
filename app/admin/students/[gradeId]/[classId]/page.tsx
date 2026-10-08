import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatGradeLabel } from "@/lib/grades";
import { Card, CardContent } from "@/components/ui/card";
import { Topbar } from "@/components/shell/topbar";
import { Badge } from "@/components/ui/badge";
import { Users, UserCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { CreateStudentButton } from "../../_components/create-student-button";
import { DeleteStudentButton } from "../../_components/delete-student-button";
import { ResetStudentPasswordButton } from "../../_components/reset-student-password-button";
import { DownloadPasswordsButton } from "../../_components/download-passwords-button";
import { TransferStudentsButton } from "../../_components/transfer-students-button";
import { Upload } from "lucide-react";

export const metadata = { title: "学生管理 · 班级学生" };

export default async function ClassStudentsPage({
  params,
}: {
  params: Promise<{ gradeId: string; classId: string }>;
}) {
  const { gradeId, classId } = await params;

  const cls = await prisma.class.findUnique({
    where: { id: classId },
    include: {
      grade: true,
      students: {
        orderBy: [{ studentNo: "asc" }],
        select: {
          id: true,
          name: true,
          studentNo: true,
          email: true,
          status: true,
          mustChangePassword: true,
          lastLoginAt: true,
          createdAt: true,
        },
      },
      teachers: {
        include: { teacher: { select: { id: true, name: true, teacherNo: true } } },
      },
    },
  });

  if (!cls || cls.gradeId !== gradeId) notFound();

  // 拿所有 ACTIVE 班级供转班下拉
  const allClasses = await prisma.class.findMany({
    where: { isActive: true, NOT: { id: classId } },
    select: { id: true, name: true, grade: { select: { name: true } } },
    orderBy: [{ grade: { joinYear: "desc" } }, { name: "asc" }],
  });

  const activeCount = cls.students.filter((s) => s.status === "ACTIVE").length;
  const disabledCount = cls.students.length - activeCount;

  const stats = [
    { icon: Users, label: "学生总数", num: cls.students.length, suffix: "人" },
    { icon: UserCheck, label: "在读", num: activeCount },
    { icon: Users, label: "已停用", num: disabledCount },
  ];

  // 用于下载密码 CSV 的初始化密码（基于学号后 6 位）
  const passwordMap = Object.fromEntries(
    cls.students.map((s) => [s.id, s.studentNo ? s.studentNo.slice(-6) : ""]),
  );

  return (
    <>
      <Topbar
        crumbs={[
          { label: "学生管理", href: "/admin/students" },
          { label: cls.grade.name, href: `/admin/students/${cls.gradeId}` },
          { label: cls.name },
        ]}
      />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <Link
                href={`/admin/students/${cls.gradeId}`}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronLeft className="h-3 w-3" />
                返回「{cls.grade.name}」班级列表
              </Link>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">
                {cls.name}{" "}
                <span className="text-base font-normal text-muted-foreground">
                  · {formatGradeLabel(cls.grade.name, cls.joinYear)}
                </span>
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {cls.teachers[0]
                  ? `任课教师：${cls.teachers[0].teacher.name}`
                  : "暂无任课教师（可在教师管理页分配）"}
                。学生初始密码 = 学号后 6 位，首次登录强制修改。
              </p>
            </div>
            <div className="flex items-center gap-2">
              <TransferStudentsButton fromClassId={cls.id} classes={allClasses} />
              <DownloadPasswordsButton
                className={cls.name}
                students={cls.students.map((s) => ({
                  name: s.name,
                  studentNo: s.studentNo ?? "",
                  password: passwordMap[s.id] ?? "",
                }))}
              />
              <Link
                href={`/admin/students/${cls.gradeId}/${cls.id}/import`}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <Upload className="h-4 w-4" />
                批量导入
              </Link>
              <CreateStudentButton classId={cls.id} className={cls.name} />
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
              {cls.students.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      「{cls.name}」还没有任何学生
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      点击右上角「添加学生」逐条录入，或使用「批量导入」从 Excel / CSV 一次导入。
                    </p>
                  </div>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                      <th className="px-6 py-3">学号</th>
                      <th className="px-6 py-3">姓名</th>
                      <th className="px-6 py-3">邮箱</th>
                      <th className="px-6 py-3">状态</th>
                      <th className="px-6 py-3">最后登录</th>
                      <th className="px-6 py-3 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {cls.students.map((s) => (
                      <tr key={s.id} className="transition-colors hover:bg-muted/30">
                        <td className="px-6 py-3.5 num font-mono text-xs text-muted-foreground">
                          {s.studentNo}
                        </td>
                        <td className="px-6 py-3.5 font-medium text-foreground">{s.name}</td>
                        <td className="px-6 py-3.5 text-muted-foreground">{s.email}</td>
                        <td className="px-6 py-3.5">
                          {s.status === "ACTIVE" ? (
                            <Badge variant="success">在读</Badge>
                          ) : (
                            <Badge variant="default">已停用</Badge>
                          )}
                          {s.mustChangePassword && s.status === "ACTIVE" && (
                            <span
                              className="ml-2 inline-flex items-center gap-1 text-[11px] text-warning"
                              title="尚未修改初始密码"
                            >
                              · 未改密
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3.5 text-xs text-muted-foreground num">
                          {s.lastLoginAt
                            ? new Date(s.lastLoginAt).toLocaleString("zh-CN", {
                                month: "2-digit",
                                day: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "从未登录"}
                        </td>
                        <td className="px-6 py-3.5">
                          <div className="flex items-center justify-end gap-2">
                            <ResetStudentPasswordButton
                              gradeId={cls.gradeId}
                              classId={cls.id}
                              studentId={s.id}
                              studentName={s.name}
                              newPassword={passwordMap[s.id] ?? ""}
                            />
                            <DeleteStudentButton
                              gradeId={cls.gradeId}
                              classId={cls.id}
                              studentId={s.id}
                              studentName={s.name}
                              studentNo={s.studentNo ?? ""}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {cls.students.length > 0 && (
            <p className="text-center text-xs text-subtle-foreground">
              共 {cls.students.length} 名学生 · 初始密码 = 学号后 6 位
            </p>
          )}
        </div>
      </main>
    </>
  );
}
