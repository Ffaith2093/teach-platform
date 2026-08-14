import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/shell/topbar";
import { ExamForm } from "./_components/exam-form";

export const metadata = { title: "新建试卷" };

export default async function NewExamPage() {
  const session = await auth();
  if (session!.user.role !== "TEACHER") {
    redirect("/login?error=forbidden");
  }
  const userId = session!.user.id;

  // 我作为主讲/助教的所有未归档课程
  const memberships = await prisma.courseTeacher.findMany({
    where: { teacherId: userId, role: { in: ["OWNER", "ASSISTANT"] } },
    select: {
      courseId: true,
      course: { select: { title: true, isArchived: true } },
    },
  });
  const courses = memberships
    .filter((m) => !m.course.isArchived)
    .map((m) => ({ id: m.courseId, title: m.course.title }));

  if (courses.length === 0) {
    return (
      <>
        <Topbar crumbs={[{ label: "我的试卷", href: "/t/exams" }, { label: "新建" }]} />
        <main className="flex-1 p-8">
          <div className="mx-auto flex max-w-2xl flex-col gap-4 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">新建试卷</h1>
            <p className="text-sm text-muted-foreground">
              您尚未加入任何课程。请联系管理员把您加入课程后再来创建试卷。
            </p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Topbar crumbs={[{ label: "我的试卷", href: "/t/exams" }, { label: "新建" }]} />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">新建试卷</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              填写基本信息。发布后学生即可在开考时间参与。
            </p>
          </div>
          <ExamForm courses={courses} />
        </div>
      </main>
    </>
  );
}
