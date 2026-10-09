import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/shell/topbar";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { SurveyResponseForm } from "./survey-response-form";

export default async function StudentSurveyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const me = await prisma.user.findUnique({ where: { id: session!.user.id }, select: { classId: true } });
  if (!me?.classId) notFound();
  const survey = await prisma.survey.findFirst({
    where: { id, status: { in: ["PUBLISHED", "CLOSED"] }, course: { classes: { some: { classId: me.classId } } } },
    include: {
      course: { select: { title: true } }, chapter: { select: { title: true, order: true } }, questions: { orderBy: { order: "asc" } },
      responses: { where: { studentId: session!.user.id }, select: { answers: true, submittedAt: true }, take: 1 },
    },
  });
  if (!survey) notFound();
  const response = survey.responses[0];
  const canSubmit = survey.status === "PUBLISHED" && (!survey.dueAt || survey.dueAt >= new Date());
  const initialAnswers = response?.answers && typeof response.answers === "object" && !Array.isArray(response.answers) ? response.answers as Record<string, unknown> : {};

  return <><Topbar crumbs={[{ label: "问卷", href: "/surveys" }, { label: survey.title }]} /><main className="flex-1 p-8"><div className="mx-auto max-w-[820px] space-y-6"><div><Link href="/surveys" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ChevronLeft className="h-3 w-3" />返回问卷</Link><div className="mt-2 flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold tracking-tight">{survey.title}</h1>{response && <Badge variant="success">已提交</Badge>}{!canSubmit && <Badge variant="default">已结束</Badge>}</div><p className="mt-1.5 text-sm text-muted-foreground">{survey.course.title} · 第 {survey.chapter.order} 章 {survey.chapter.title}{survey.dueAt ? ` · ${formatDate(survey.dueAt)} 截止` : ""}</p>{survey.description && <p className="mt-4 whitespace-pre-line rounded-lg border border-border bg-muted/40 p-4 text-sm">{survey.description}</p>}{response && <p className="mt-2 text-xs text-muted-foreground">最近提交：{formatDate(response.submittedAt)}</p>}</div><SurveyResponseForm surveyId={survey.id} questions={survey.questions.map((question) => ({ ...question, options: Array.isArray(question.options) ? question.options.map(String) : [] }))} initialAnswers={initialAnswers} canSubmit={canSubmit} /></div></main></>;
}
