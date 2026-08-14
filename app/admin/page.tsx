import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Topbar } from "@/components/shell/topbar";
import { Users, UserCog, BookOpen, Server } from "lucide-react";

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
    { icon: Users, label: "在读学生", num: studentCount },
    { icon: UserCog, label: "在职教师", num: teacherCount },
    { icon: BookOpen, label: "活跃课程", num: courseCount },
    { icon: Server, label: "评测队列", num: judgePending },
  ];

  return (
    <>
      <Topbar crumbs={[{ label: "工作台" }]} />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">管理员工作台</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              欢迎，{session?.user.name}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {stats.map((s) => {
              const Icon = s.icon;
              return (
                <Card key={s.label} className="hover:border-primary/40 hover:shadow-md">
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
              );
            })}
          </div>

          <div className="rounded-xl border border-dashed border-border bg-muted/40 p-8 text-center text-sm text-muted-foreground">
            <p>
              教师详情 / 学生批量导入 / 题库管理 / 评测队列等模块将在 <b className="text-foreground">P1.2</b> 起逐步接入。
            </p>
            <Link href="/login" className="mt-2 inline-block text-xs text-primary hover:underline">
              ← 返回登录
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
