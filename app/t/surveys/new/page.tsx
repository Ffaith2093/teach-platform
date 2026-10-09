import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/shell/topbar";
import { SurveyBuilder } from "./survey-builder";

export const metadata = { title: "新建问卷" };

export default async function NewSurveyPage({ searchParams }: { searchParams: Promise<{ courseId?: string; chapterId?: string }> }) {
  const session = await auth();
  const query = await searchParams;
  const courses = await prisma.course.findMany({
    where: {
      isArchived: false,
      teachers: { some: { teacherId: session!.user.id, role: { in: ["OWNER", "ASSISTANT"] } } },
    },
    select: {
      id: true,
      title: true,
      chapters: { orderBy: { order: "asc" }, select: { id: true, title: true, order: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  if (courses.length === 0) redirect("/t/surveys");

  return (
    <>
      <Topbar crumbs={[{ label: "问卷", href: "/t/surveys" }, { label: "新建问卷" }]} />
      <main className="flex-1 p-8">
        <div className="mx-auto max-w-[960px] space-y-6">
          <div>
            <Link href="/t/surveys" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ChevronLeft className="h-3 w-3" />返回问卷</Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">新建问卷</h1>
          </div>
          <SurveyBuilder courses={courses} initialCourseId={query.courseId} initialChapterId={query.chapterId} />
        </div>
      </main>
    </>
  );
}
