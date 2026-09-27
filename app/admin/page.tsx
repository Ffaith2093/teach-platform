import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Topbar } from "@/components/shell/topbar";
import { Users, UserCog, BookOpen, Server, ChevronRight } from "lucide-react";

export const metadata: Metadata = { title: "管理员工作台" };

export default async function AdminDashboardPage() {
  const session = await auth();
  const [studentCount, teacherCount, courseCount, judgePending] = await Promise.all([
    prisma.user.count({ where: { role: "STUDENT", status: "ACTIVE" } }),
    prisma.user.count({ where: { role: "TEACHER", status: "ACTIVE" } }),
    prisma.course.count({ where: { isArchived: false } }),
    prisma.submission.count({ where: { status: { in: ["PENDING", "JUDGING"] } } }),
  ]);

  const stats = [
    { icon: Users, label: "在读学生", num: studentCount, href: "/admin/students" },
    { icon: UserCog, label: "在职教师", num: teacherCount, href: "/admin/teachers" },
    { icon: BookOpen, label: "活跃课程", num: courseCount, href: "/admin/courses" },
    { icon: Server, label: "评测队列", num: judgePending, href: "/admin/judge" },
  ];

  const quickEntries = [
    { href: "/admin/students", label: "学生管理", desc: "按年级 / 班级组织、批量导入、转班" },
    { href: "/admin/teachers", label: "教师管理", desc: "创建教师账号并分配授课班级" },
    { href: "/admin/courses", label: "课程管理", desc: "全站课程归档、所有者与协作者" },
    { href: "/admin/judge", label: "评测队列", desc: "BullMQ 队列长度、失败率、Worker 状态" },
  ];

  return (
    <>
      <Topbar crumbs={[{ label: "工作台" }]} />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            欢迎，{session?.user.name}
          </h1>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {stats.map((s) => {
              const Icon = s.icon;
              return (
                <Link
                  key={s.label}
                  href={s.href}
                  className="group block transition-all"
                >
                  <Card className="transition-all group-hover:border-primary/40 group-hover:shadow-md">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between">
                        <span className="text-sm text-muted-foreground">{s.label}</span>
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                          <Icon className="h-4 w-4" />
                        </div>
                      </div>
                      <div className="mt-3 text-3xl font-bold tracking-tight num">{s.num}</div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>

          <Card>
            <CardContent className="p-6">
              <h2 className="mb-4 text-base font-semibold">快捷入口</h2>
              <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {quickEntries.map((e) => (
                  <li key={e.href}>
                    <Link
                      href={e.href}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 transition-all hover:border-primary/40 hover:shadow-sm"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground">{e.label}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">{e.desc}</div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-subtle-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
