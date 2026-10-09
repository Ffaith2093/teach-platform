import Link from "next/link";
import { ClipboardList, Plus, ChevronRight } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/shell/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import type { SurveyStatus } from "@prisma/client";

export const metadata = { title: "问卷" };

const STATUS: Record<SurveyStatus, { label: string; tone: "default" | "success" | "warning" }> = {
  DRAFT: { label: "草稿", tone: "default" },
  PUBLISHED: { label: "回收中", tone: "success" },
  CLOSED: { label: "已关闭", tone: "warning" },
};

export default async function TeacherSurveysPage() {
  const session = await auth();
  const [surveys, courseCount] = await Promise.all([
    prisma.survey.findMany({
      where: { course: { teachers: { some: { teacherId: session!.user.id } } } },
      include: {
        course: { select: { title: true } },
        chapter: { select: { title: true, order: true } },
        _count: { select: { questions: true, responses: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.course.count({
      where: { isArchived: false, teachers: { some: { teacherId: session!.user.id, role: { in: ["OWNER", "ASSISTANT"] } } } },
    }),
  ]);

  return (
    <>
      <Topbar crumbs={[{ label: "问卷" }]} />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
          <div className="flex items-end justify-between gap-4">
            <div><h1 className="text-2xl font-semibold tracking-tight">问卷</h1><p className="mt-1.5 text-sm text-muted-foreground">查看课程问卷的班级回收情况。</p></div>
            {courseCount > 0 && <Button asChild><Link href="/t/surveys/new"><Plus className="h-4 w-4" />新建问卷</Link></Button>}
          </div>

          {surveys.length === 0 ? (
            <Card><CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center"><ClipboardList className="h-10 w-10 text-muted-foreground" /><p className="text-sm font-medium">暂无问卷</p>{courseCount > 0 ? <Button asChild size="sm"><Link href="/t/surveys/new">新建第一份问卷</Link></Button> : <p className="text-xs text-muted-foreground">请先创建课程和章节</p>}</CardContent></Card>
          ) : (
            <Card><CardContent className="p-0"><ul className="divide-y divide-border">{surveys.map((survey) => (
              <li key={survey.id}><Link href={`/t/surveys/${survey.id}`} className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-muted/40">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary"><ClipboardList className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-medium text-foreground">{survey.title}</span><Badge variant={STATUS[survey.status].tone}>{STATUS[survey.status].label}</Badge></div><p className="mt-1 truncate text-xs text-muted-foreground">{survey.course.title} · 第 {survey.chapter.order} 章 {survey.chapter.title}</p></div>
                <div className="hidden text-right text-xs text-muted-foreground sm:block"><div><span className="num font-medium text-foreground">{survey._count.responses}</span> 份回收</div><div className="mt-1 num">{survey._count.questions} 题{survey.dueAt ? ` · ${formatDate(survey.dueAt)} 截止` : ""}</div></div>
                <ChevronRight className="h-4 w-4 text-subtle-foreground" />
              </Link></li>
            ))}</ul></CardContent></Card>
          )}
        </div>
      </main>
    </>
  );
}
