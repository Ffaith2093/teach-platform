import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen,
  FileText,
  ClipboardCheck,
  ChevronRight,
  Inbox,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "课程章节" };

export default async function StudentChaptersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: courseId } = await params;
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
      id: courseId,
      isArchived: false,
      classes: { some: { classId: me.classId } },
    },
    include: {
      chapters: {
        orderBy: { order: "asc" },
        include: {
          _count: { select: { assignments: true, exams: true } },
        },
      },
      _count: { select: { assignments: true, exams: true } },
    },
  });
  if (!course) notFound();

  // 未分组作业/考试：published 状态 + chapterId = null
  const ungrouped = await prisma.$transaction([
    prisma.assignment.count({
      where: {
        courseId,
        chapterId: null,
        publishedAt: { not: null },
      },
    }),
    prisma.exam.count({
      where: {
        courseId,
        chapterId: null,
        status: { in: ["PUBLISHED", "CLOSED"] },
      },
    }),
  ]);
  const ungroupedAssignmentCount = ungrouped[0];
  const ungroupedExamCount = ungrouped[1];

  const hasChapters = course.chapters.length > 0;
  const hasUngrouped = ungroupedAssignmentCount + ungroupedExamCount > 0;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary">
            <BookOpen className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">课程章节</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              按教学顺序浏览本课程内容。每章节包含该章节下的作业与考试。
            </p>
            <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 num">
                <BookOpen className="h-3 w-3" />
                {course.chapters.length} 章节
              </span>
              <span className="inline-flex items-center gap-1 num">
                <FileText className="h-3 w-3" />
                {course._count.assignments} 作业
              </span>
              <span className="inline-flex items-center gap-1 num">
                <ClipboardCheck className="h-3 w-3" />
                {course._count.exams} 考试
              </span>
            </div>
          </div>
        </div>
      </div>

      {!hasChapters && !hasUngrouped ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">本课程暂无章节内容</p>
              <p className="mt-1 text-xs text-muted-foreground">
                老师正在准备中，请稍后再来查看。
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-3">
            {course.chapters.map((c) => (
              <Link
                key={c.id}
                href={`/courses/${courseId}/chapters/${c.id}`}
                className="block rounded-xl border border-border bg-card transition-colors hover:bg-muted/30"
              >
                <div className="flex items-center gap-4 px-5 py-4">
                  <Badge variant="primary" className="num font-mono">
                    第 {c.order} 章
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {c.title}
                    </div>
                    {c.description && (
                      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                        {c.description}
                      </p>
                    )}
                    <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1 num">
                        <FileText className="h-3 w-3" />
                        {c._count.assignments} 作业
                      </span>
                      <span className="inline-flex items-center gap-1 num">
                        <ClipboardCheck className="h-3 w-3" />
                        {c._count.exams} 考试
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-subtle-foreground" />
                </div>
              </Link>
            ))}
          </div>

          {hasUngrouped && (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-5">
              <div className="flex items-center gap-2 text-sm">
                <Inbox className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-foreground">未分组</span>
                <span className="text-xs text-muted-foreground">
                  老师尚未归入章节的作业与考试
                </span>
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 num">
                  <FileText className="h-3 w-3" />
                  {ungroupedAssignmentCount} 作业
                </span>
                <span className="inline-flex items-center gap-1 num">
                  <ClipboardCheck className="h-3 w-3" />
                  {ungroupedExamCount} 考试
                </span>
                <span className="text-subtle-foreground">
                  （可在「作业」/「考试」Tab 看到全部）
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}