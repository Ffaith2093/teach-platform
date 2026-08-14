import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/shell/topbar";
import { ChevronLeft, BookOpen } from "lucide-react";
import { CreateCourseForm } from "../_components/create-course-form";

export const metadata = { title: "新建课程" };

export default async function NewCoursePage() {
  const session = await auth();
  const userId = session!.user.id;

  // 教师任教的班级（用于选班级）
  const taughtClasses = await prisma.classTeacher.findMany({
    where: { teacherId: userId },
    include: {
      class: {
        include: {
          grade: { select: { name: true, joinYear: true } },
          _count: { select: { students: { where: { status: "ACTIVE" } } } },
        },
      },
    },
    orderBy: { class: { name: "asc" } },
  });

  // 可邀请的协作者（所有在职、且不是自己）
  const collaborators = await prisma.user.findMany({
    where: {
      role: "TEACHER",
      status: "ACTIVE",
      NOT: { id: userId },
    },
    select: { id: true, name: true, teacherNo: true, subjects: true },
    orderBy: { name: "asc" },
  });

  if (taughtClasses.length === 0) {
    redirect("/t/courses?error=no-classes");
  }

  return (
    <>
      <Topbar
        crumbs={[
          { label: "我的课程", href: "/t/courses" },
          { label: "新建课程" },
        ]}
      />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1024px] flex-col gap-6">
          <div>
            <Link
              href="/t/courses"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-3 w-3" />
              返回我的课程
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">新建课程</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              一次完成：<b className="text-foreground">基本信息 → 授课班级 → 协作者</b>。
              创建后您自动成为主讲教师。
            </p>
          </div>

          <CreateCourseForm
            classes={taughtClasses.map((ct) => ({
              id: ct.classId,
              name: ct.class.name,
              gradeName: ct.class.grade.name,
              gradeJoinYear: ct.class.grade.joinYear,
              studentCount: ct.class._count.students,
            }))}
            collaborators={collaborators.map((c) => ({
              id: c.id,
              name: c.name,
              teacherNo: c.teacherNo,
              subjects: c.subjects,
            }))}
          />

          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground">
            <BookOpen className="mr-1.5 inline h-3.5 w-3.5" />
            提示：所选班级必须由您任教（管理员在「教师管理 → 分配班级」中分配）；协作者将作为助教加入。
          </div>
        </div>
      </main>
    </>
  );
}