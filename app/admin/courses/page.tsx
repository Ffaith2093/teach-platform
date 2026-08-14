import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Topbar } from "@/components/shell/topbar";
import { Badge } from "@/components/ui/badge";
import { CourseFilterBar } from "./_components/course-filter-bar";
import { BookOpen, Archive, Users, GraduationCap } from "lucide-react";
import type { CourseCategory } from "@prisma/client";

export const metadata = { title: "课程管理" };

const CATEGORY_LABELS: Record<CourseCategory, { label: string; tone: "primary" | "accent" | "warning" | "success" | "default" }> = {
  DATA: { label: "数据", tone: "primary" },
  ALGORITHM: { label: "算法", tone: "accent" },
  AI: { label: "人工智能", tone: "warning" },
  NETWORK: { label: "计算机网络", tone: "success" },
  INTERDISCIPLINARY: { label: "多学科交叉", tone: "default" },
};

interface SearchParams {
  category?: string;
  archived?: string;
  q?: string;
}

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const categoryFilter = isCourseCategory(sp.category) ? sp.category : "ALL";
  const showArchived = sp.archived === "1";

  const courses = await prisma.course.findMany({
    where: {
      ...(categoryFilter !== "ALL" ? { category: categoryFilter } : {}),
      ...(showArchived ? {} : { isArchived: false }),
      ...(sp.q ? { title: { contains: sp.q, mode: "insensitive" } } : {}),
    },
    orderBy: [{ isArchived: "asc" }, { updatedAt: "desc" }],
    include: {
      _count: { select: { classes: true, assignments: true, exams: true } },
      teachers: {
        where: { role: "OWNER" },
        include: { teacher: { select: { id: true, name: true, teacherNo: true } } },
      },
    },
  });

  const [totalCount, activeCount, archivedCount, totalClasses] = await Promise.all([
    prisma.course.count(),
    prisma.course.count({ where: { isArchived: false } }),
    prisma.course.count({ where: { isArchived: true } }),
    prisma.courseClass.count(),
  ]);

  const stats = [
    { icon: BookOpen, label: "课程总数", num: totalCount },
    { icon: GraduationCap, label: "活跃", num: activeCount },
    { icon: Archive, label: "已归档", num: archivedCount },
    { icon: Users, label: "班级绑定", num: totalClasses, suffix: "次" },
  ];

  return (
    <>
      <Topbar crumbs={[{ label: "课程管理" }]} />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">课程管理</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              课程由教师在教师端创建，管理员在此负责全站课程的
              <b className="text-foreground">归档 / 转让所有权 / 基本信息纠错</b>。
              课程按分类归档后，对教师与学生隐藏，但历史作业与成绩保留。
            </p>
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

          <CourseFilterBar
            category={categoryFilter}
            showArchived={showArchived}
            query={sp.q ?? ""}
          />

          <Card>
            <CardContent className="p-0">
              {courses.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">没有匹配的课程</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      调整筛选条件，或前往教师端创建新课程。
                    </p>
                  </div>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                      <th className="px-6 py-3">课程标题</th>
                      <th className="px-6 py-3">分类</th>
                      <th className="px-6 py-3">学期</th>
                      <th className="px-6 py-3">主讲教师</th>
                      <th className="px-6 py-3">班级 / 作业 / 试卷</th>
                      <th className="px-6 py-3">状态</th>
                      <th className="px-6 py-3 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {courses.map((c) => {
                      const owner = c.teachers[0]?.teacher;
                      const cat = CATEGORY_LABELS[c.category];
                      return (
                        <tr
                          key={c.id}
                          className={`transition-colors hover:bg-muted/30 ${
                            c.isArchived ? "opacity-60" : ""
                          }`}
                        >
                          <td className="px-6 py-3.5">
                            <Link
                              href={`/admin/courses/${c.id}`}
                              className="font-medium text-foreground transition-colors hover:text-primary"
                            >
                              {c.title}
                            </Link>
                            {c.description && (
                              <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                                {c.description}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-3.5">
                            <Badge variant={cat.tone}>{cat.label}</Badge>
                          </td>
                          <td className="px-6 py-3.5 text-muted-foreground">{c.semester}</td>
                          <td className="px-6 py-3.5 text-muted-foreground">
                            {owner ? (
                              <span className="inline-flex items-center gap-1.5">
                                <span className="text-foreground">{owner.name}</span>
                                <span className="num text-xs">· {owner.teacherNo}</span>
                              </span>
                            ) : (
                              <span className="text-xs text-subtle-foreground">未分配</span>
                            )}
                          </td>
                          <td className="px-6 py-3.5 num text-xs text-muted-foreground">
                            {c._count.classes} 班 · {c._count.assignments} 作业 · {c._count.exams} 试卷
                          </td>
                          <td className="px-6 py-3.5">
                            {c.isArchived ? (
                              <Badge variant="default">已归档</Badge>
                            ) : (
                              <Badge variant="success">活跃</Badge>
                            )}
                          </td>
                          <td className="px-6 py-3.5 text-right">
                            <Link
                              href={`/admin/courses/${c.id}`}
                              className="rounded-md px-2.5 py-1 text-xs text-primary transition-colors hover:bg-primary-subtle"
                            >
                              详情 →
                            </Link>
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

function isCourseCategory(v: string | undefined): v is CourseCategory {
  return v === "DATA" || v === "ALGORITHM" || v === "AI" || v === "NETWORK" || v === "INTERDISCIPLINARY";
}