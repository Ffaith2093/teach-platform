import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Topbar } from "@/components/shell/topbar";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Users, FileText, Plus } from "lucide-react";
import type { CourseCategory } from "@prisma/client";

export const metadata = { title: "我的课程" };

const CATEGORY_LABELS: Record<CourseCategory, { label: string; tone: "primary" | "accent" | "warning" | "success" | "default" }> = {
  DATA: { label: "数据", tone: "primary" },
  ALGORITHM: { label: "算法", tone: "accent" },
  AI: { label: "人工智能", tone: "warning" },
  NETWORK: { label: "计算机网络", tone: "success" },
  INTERDISCIPLINARY: { label: "多学科交叉", tone: "default" },
};

export default async function TeacherCoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const session = await auth();
  const userId = session!.user.id;
  const sp = await searchParams;
  const showArchived = sp.archived === "1";

  const courses = await prisma.courseTeacher.findMany({
    where: {
      teacherId: userId,
      course: showArchived ? {} : { isArchived: false },
    },
    orderBy: [{ course: { isArchived: "asc" } }, { course: { updatedAt: "desc" } }],
    include: {
      course: {
        include: {
          _count: { select: { classes: true, assignments: true, exams: true } },
          teachers: {
            where: { role: "OWNER" },
            include: { teacher: { select: { name: true } } },
          },
        },
      },
    },
  });

  const [myOwnCount, myAsstCount, archivedCount] = await Promise.all([
    prisma.courseTeacher.count({ where: { teacherId: userId, role: "OWNER", course: { isArchived: false } } }),
    prisma.courseTeacher.count({ where: { teacherId: userId, role: "ASSISTANT", course: { isArchived: false } } }),
    prisma.courseTeacher.count({ where: { teacherId: userId, course: { isArchived: true } } }),
  ]);

  const stats = [
    { icon: BookOpen, label: "我主讲", num: myOwnCount },
    { icon: Users, label: "我参与的", num: myAsstCount },
    { icon: FileText, label: "已归档", num: archivedCount },
  ];

  return (
    <>
      <Topbar crumbs={[{ label: "我的课程" }]} />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">我的课程</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                创建课程前，请先在「班级管理」确认您已被分配授课班级。
                您只能将<b className="text-foreground">自己任教的班级</b>加入课程。
              </p>
            </div>
            <Link
              href="/t/courses/new"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
            >
              <Plus className="h-4 w-4" />
              新建课程
            </Link>
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
                    <div className="mt-3 text-3xl font-bold tracking-tight num">{s.num}</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="flex items-center gap-3 text-sm">
            <Link
              href="/t/courses"
              className={`rounded-md px-2 py-1 text-xs ${
                !showArchived
                  ? "bg-primary-subtle font-medium text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              活跃
            </Link>
            <Link
              href="/t/courses?archived=1"
              className={`rounded-md px-2 py-1 text-xs ${
                showArchived
                  ? "bg-primary-subtle font-medium text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              已归档
            </Link>
          </div>

          <Card>
            <CardContent className="p-0">
              {courses.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {showArchived ? "没有已归档课程" : "还没有任何课程"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {showArchived
                        ? "归档的课程会出现在这里。"
                        : "点击右上角「新建课程」开始创建。"}
                    </p>
                  </div>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {courses.map((ct) => {
                    const c = ct.course;
                    const cat = CATEGORY_LABELS[c.category];
                    const owner = c.teachers[0]?.teacher;
                    return (
                      <li key={ct.id}>
                        <Link
                          href={`/t/courses/${c.id}`}
                          className="flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-muted/30"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground">
                                {c.title}
                              </span>
                              <Badge variant={cat.tone}>{cat.label}</Badge>
                              {ct.role === "OWNER" ? (
                                <Badge variant="primary">主讲</Badge>
                              ) : ct.role === "ASSISTANT" ? (
                                <Badge variant="accent">助教</Badge>
                              ) : (
                                <Badge variant="default">外聘</Badge>
                              )}
                              {c.isArchived && <Badge variant="default">已归档</Badge>}
                            </div>
                            {c.description && (
                              <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                                {c.description}
                              </div>
                            )}
                            <div className="mt-1.5 flex items-center gap-3 text-[11px] text-subtle-foreground">
                              <span>{c.semester}</span>
                              {owner && ct.role !== "OWNER" && (
                                <span>· 主讲：{owner.name}</span>
                              )}
                            </div>
                          </div>
                          <div className="hidden shrink-0 items-center gap-4 text-xs text-muted-foreground md:flex">
                            <span className="num">{c._count.classes} 班</span>
                            <span className="num">{c._count.assignments} 作业</span>
                            <span className="num">{c._count.exams} 试卷</span>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}