import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Topbar } from "@/components/shell/topbar";
import { Users, FileText, ClipboardCheck } from "lucide-react";

export const metadata: Metadata = { title: "教师工作台" };

export default async function TeacherDashboardPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [classCount, weekSubs, toGrade] = await Promise.all([
    prisma.classTeacher.count({ where: { teacherId: userId } }),
    prisma.submission.count({
      where: {
        userId,
        contextType: "ASSIGNMENT",
        createdAt: { gte: new Date(Date.now() - 7 * 86400000) },
      },
    }),
    prisma.assignmentSubmission.count({
      where: { status: "SUBMITTED", gradedById: null, assignment: { course: { teachers: { some: { teacherId: userId } } } } },
    }),
  ]);

  return (
    <>
      <Topbar crumbs={[{ label: "工作台" }]} />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{session?.user.name} 老师</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">欢迎回到 PyLearn 教师端</p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card className="hover:border-primary/40 hover:shadow-md">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <span className="text-sm text-muted-foreground">我教的班级</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                    <Users className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3 text-3xl font-bold tracking-tight num">{classCount}</div>
                <div className="mt-1 text-xs text-muted-foreground">管理员分配的授课班级</div>
              </CardContent>
            </Card>
            <Card className="hover:border-primary/40 hover:shadow-md">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <span className="text-sm text-muted-foreground">本周提交</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-subtle text-accent">
                    <FileText className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3 text-3xl font-bold tracking-tight num">{weekSubs}</div>
                <div className="mt-1 text-xs text-muted-foreground">学生提交记录</div>
              </CardContent>
            </Card>
            <Card className="hover:border-warning/40 hover:shadow-md">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <span className="text-sm text-muted-foreground">待批改</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning-subtle text-warning">
                    <ClipboardCheck className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3 text-3xl font-bold tracking-tight num">{toGrade}</div>
                <div className="mt-1 text-xs text-muted-foreground">已提交未批改</div>
              </CardContent>
            </Card>
          </div>

          <div className="rounded-xl border border-dashed border-border bg-muted/40 p-8 text-center text-sm text-muted-foreground">
            <p>
              今日课程、班级动态等模块将在 <b className="text-foreground">P4 课程与资源</b> 切片中实现。
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
