import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/shell/topbar";
import { ChevronLeft, FileText } from "lucide-react";
import { CreateAssignmentForm } from "../_components/create-assignment-form";

export const metadata = { title: "新建作业" };

export default async function NewAssignmentPage() {
  const session = await auth();
  const userId = session!.user.id;

  // 我主讲/助教的所有未归档课程
  const memberships = await prisma.courseTeacher.findMany({
    where: {
      teacherId: userId,
      role: { in: ["OWNER", "ASSISTANT"] },
      course: { isArchived: false },
    },
    include: {
      course: {
        select: {
          id: true,
          title: true,
          _count: { select: { classes: true } },
        },
      },
    },
    orderBy: { course: { title: "asc" } },
  });

  if (memberships.length === 0) {
    redirect("/t/courses?error=no-course");
  }

  // 可挂载的编程题（本人创建 + 公开题库）
  const problems = await prisma.problem.findMany({
    where: {
      OR: [{ authorId: userId }, { isPublic: true }],
    },
    select: {
      id: true,
      title: true,
      difficulty: true,
      tags: true,
      isPublic: true,
      authorId: true,
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 200,
  });

  return (
    <>
      <Topbar
        crumbs={[
          { label: "我的作业", href: "/t/assignments" },
          { label: "新建作业" },
        ]}
      />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1024px] flex-col gap-6">
          <div>
            <Link
              href="/t/assignments"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-3 w-3" />
              返回我的作业
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">新建作业</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              一次完成：<b className="text-foreground">选课程 → 基本信息 → 挂载编程题</b>。
              可保存为草稿继续编辑，也可直接发布。
            </p>
          </div>

          <CreateAssignmentForm
            courses={memberships.map((m) => ({
              id: m.course.id,
              title: m.course.title,
              classCount: m.course._count.classes,
              role: m.role,
            }))}
            problems={problems.map((p) => ({
              id: p.id,
              title: p.title,
              difficulty: p.difficulty,
              tags: p.tags,
              isPublic: p.isPublic,
              isMine: p.authorId === userId,
            }))}
          />

          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground">
            <FileText className="mr-1.5 inline h-3.5 w-3.5" />
            提示：作业的总分等于所有挂载题分值之和；只有草稿态可编辑，发布后只能修改题目。
          </div>
        </div>
      </main>
    </>
  );
}