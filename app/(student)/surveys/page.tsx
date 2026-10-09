import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList, ChevronRight } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/shell/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "问卷" };

export default async function StudentSurveysPage() {
  const session = await auth();
  const me = await prisma.user.findUnique({ where: { id: session!.user.id }, select: { classId: true } });
  if (!me?.classId) redirect("/dashboard");
  const surveys = await prisma.survey.findMany({
    where: { status: { in: ["PUBLISHED", "CLOSED"] }, course: { classes: { some: { classId: me.classId } } } },
    include: {
      course: { select: { title: true } }, chapter: { select: { title: true, order: true } },
      responses: { where: { studentId: session!.user.id }, select: { submittedAt: true }, take: 1 },
      _count: { select: { questions: true } },
    },
    orderBy: [{ status: "desc" }, { createdAt: "desc" }],
  });
  const now = new Date();

  return <><Topbar crumbs={[{ label: "问卷" }]} /><main className="flex-1 p-8"><div className="mx-auto max-w-[1000px] space-y-6"><div><h1 className="text-2xl font-semibold tracking-tight">问卷</h1><p className="mt-1.5 text-sm text-muted-foreground">课程反馈与课堂评价。</p></div>{surveys.length === 0 ? <Card><CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center"><ClipboardList className="h-10 w-10 text-muted-foreground" /><p className="text-sm font-medium">暂无问卷</p></CardContent></Card> : <Card><CardContent className="p-0"><ul className="divide-y divide-border">{surveys.map((survey) => { const response = survey.responses[0]; const expired = !!survey.dueAt && survey.dueAt < now; const open = survey.status === "PUBLISHED" && !expired; return <li key={survey.id}><Link href={`/surveys/${survey.id}`} className="flex items-center gap-4 px-6 py-4 hover:bg-muted/40"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-subtle text-primary"><ClipboardList className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{survey.title}</span>{response ? <Badge variant="success">已提交</Badge> : open ? <Badge variant="warning">待填写</Badge> : <Badge variant="default">已结束</Badge>}</div><p className="mt-1 truncate text-xs text-muted-foreground">{survey.course.title} · 第 {survey.chapter.order} 章 {survey.chapter.title}</p></div><div className="hidden text-right text-xs text-muted-foreground sm:block"><div className="num">{survey._count.questions} 题</div>{survey.dueAt && <div className="mt-1 num">{formatDate(survey.dueAt)} 截止</div>}</div><ChevronRight className="h-4 w-4 text-subtle-foreground" /></Link></li>; })}</ul></CardContent></Card>}</div></main></>;
}
