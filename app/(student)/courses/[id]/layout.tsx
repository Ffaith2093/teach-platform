import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/shell/topbar";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CourseCategory } from "@prisma/client";

const CATEGORY_LABELS: Record<CourseCategory, string> = {
  DATA: "数据",
  ALGORITHM: "算法",
  AI: "人工智能",
  NETWORK: "计算机网络",
  INTERDISCIPLINARY: "多学科交叉",
};

export default async function StudentCourseLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userId = session!.user.id;

  // 鉴权：必须是当前学生班级所属课程
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { classId: true },
  });
  if (!me?.classId) notFound();

  const course = await prisma.course.findFirst({
    where: {
      id,
      isArchived: false,
      classes: { some: { classId: me.classId } },
    },
    select: { id: true, title: true, description: true, semester: true, category: true },
  });
  if (!course) notFound();

  return (
    <>
      <Topbar
        crumbs={[
          { label: "我的课程", href: "/courses" },
          { label: course.title },
        ]}
      />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          {/* 课程头部 */}
          <div className="flex items-start gap-4">
            <Link
              href="/courses"
              className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="返回课程列表"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-semibold tracking-tight">{course.title}</h1>
                <Badge variant="primary">{CATEGORY_LABELS[course.category]}</Badge>
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground">{course.semester}</p>
              {course.description && (
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                  {course.description}
                </p>
              )}
            </div>
          </div>

          {/* Tab 容器 */}
          <CourseTabs courseId={course.id} />

          {children}
        </div>
      </main>
    </>
  );
}

import { headers } from "next/headers";

async function CourseTabs({ courseId }: { courseId: string }) {
  // 用 header 推断当前路径做高亮
  // App Router 没有直接拿 pathname 的 server-side API，但 next/headers 的 x-pathname 由 middleware 注入
  const headerList = await headers();
  const pathname = headerList.get("x-pathname") ?? "";
  const tabs = [
    { key: "overview", label: "概览", href: `/courses/${courseId}` },
    { key: "resources", label: "资源", href: `/courses/${courseId}/resources` },
    { key: "assignments", label: "作业", href: `/assignments?course=${courseId}` },
    { key: "exams", label: "考试", href: `/exams?course=${courseId}` },
  ];
  const activeKey = tabs.find((t) =>
    t.key === "overview"
      ? pathname === `/courses/${courseId}` || pathname === `/courses/${courseId}/`
      : t.key === "resources"
        ? pathname.startsWith(`/courses/${courseId}/resources`)
        : t.key === "assignments"
          ? pathname.startsWith("/assignments")
          : pathname.startsWith("/exams"),
  )?.key;

  return (
    <div className="border-b border-border">
      <nav className="-mb-px flex gap-6">
        {tabs.map((t) => {
          const active = t.key === activeKey;
          return (
            <Link
              key={t.key}
              href={t.href}
              className={cn(
                "relative pb-3 text-sm font-medium transition-colors",
                active
                  ? "text-primary after:absolute after:-bottom-px after:left-0 after:right-0 after:h-0.5 after:bg-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}