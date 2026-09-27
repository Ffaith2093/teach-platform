import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/shell/topbar";
import { ExamForm } from "./_components/exam-form";

export const metadata = { title: "新建试卷" };

export default async function NewExamPage({
  searchParams,
}: {
  searchParams: Promise<{ courseId?: string; chapterId?: string }>;
}) {
  const sp = await searchParams;
  const presetCourseId = sp.courseId ?? null;
  const presetChapterId = sp.chapterId ?? null;

  const session = await auth();
  if (session!.user.role !== "TEACHER") {
    redirect("/login?error=forbidden");
  }
  const userId = session!.user.id;

  // 我作为主讲/助教的所有未归档课程（含章节）
  const memberships = await prisma.courseTeacher.findMany({
    where: {
      teacherId: userId,
      role: { in: ["OWNER", "ASSISTANT"] },
      course: { isArchived: false },
    },
    select: {
      courseId: true,
      course: {
        select: {
          title: true,
          isArchived: true,
          chapters: {
            select: { id: true, title: true, order: true },
            orderBy: { order: "asc" },
          },
        },
      },
    },
  });

  const courses = memberships
    .filter((m) => !m.course.isArchived)
    .map((m) => ({
      id: m.courseId,
      title: m.course.title,
      chapters: m.course.chapters,
    }));

  const banks = await prisma.questionBank.findMany({
    where: { ownerId: userId },
    select: { id: true, name: true, _count: { select: { questions: true } } },
    orderBy: { createdAt: "desc" },
  });

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

  // 校验预选的 chapterId 属于预选 courseId
  let presetChapterValid = false;
  if (presetCourseId && presetChapterId) {
    const found = courses.find(
      (c) => c.id === presetCourseId && c.chapters.some((ch) => ch.id === presetChapterId),
    );
    presetChapterValid = !!found;
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
          <ExamForm
            courses={courses}
            banks={banks.map((bank) => ({ id: bank.id, name: bank.name, questionCount: bank._count.questions }))}
            initialCourseId={presetCourseId}
            initialChapterId={presetChapterValid ? presetChapterId : null}
          />
        </div>
      </main>
    </>
  );
}
