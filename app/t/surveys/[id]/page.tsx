import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ClipboardList, Users, BarChart3 } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/shell/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { changeSurveyStatusAction } from "../actions";
import type { SurveyStatus } from "@prisma/client";

const STATUS: Record<SurveyStatus, { label: string; tone: "default" | "success" | "warning" }> = {
  DRAFT: { label: "草稿", tone: "default" }, PUBLISHED: { label: "回收中", tone: "success" }, CLOSED: { label: "已关闭", tone: "warning" },
};

function answerRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export default async function TeacherSurveyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const survey = await prisma.survey.findFirst({
    where: { id, course: { teachers: { some: { teacherId: session!.user.id } } } },
    include: {
      course: { include: { teachers: { select: { teacherId: true, role: true } }, classes: { include: { class: { include: { students: { where: { role: "STUDENT", status: "ACTIVE" }, select: { id: true } } } } } } } },
      chapter: { select: { title: true, order: true } },
      questions: { orderBy: { order: "asc" } },
      responses: { include: { student: { select: { id: true, name: true, studentNo: true, classId: true, class: { select: { name: true } } } } }, orderBy: { submittedAt: "desc" } },
    },
  });
  if (!survey) notFound();
  const canManage = survey.course.teachers.some((teacher) => teacher.teacherId === session!.user.id && (teacher.role === "OWNER" || teacher.role === "ASSISTANT"));

  const classStats = survey.course.classes.map(({ class: schoolClass }) => {
    const studentIds = new Set(schoolClass.students.map((student) => student.id));
    const responses = survey.responses.filter((response) => studentIds.has(response.studentId)).length;
    return { id: schoolClass.id, name: schoolClass.name, expected: studentIds.size, responses };
  });
  const expectedTotal = classStats.reduce((sum, item) => sum + item.expected, 0);

  return (
    <>
      <Topbar crumbs={[{ label: "问卷", href: "/t/surveys" }, { label: survey.title }]} />
      <main className="flex-1 p-8"><div className="mx-auto max-w-[1100px] space-y-6">
        <div><Link href="/t/surveys" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ChevronLeft className="h-3 w-3" />返回问卷</Link><div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold tracking-tight">{survey.title}</h1><Badge variant={STATUS[survey.status].tone}>{STATUS[survey.status].label}</Badge></div><p className="mt-1.5 text-sm text-muted-foreground">{survey.course.title} · 第 {survey.chapter.order} 章 {survey.chapter.title}{survey.dueAt ? ` · ${formatDate(survey.dueAt)} 截止` : ""}</p></div>
        {canManage && <div className="flex gap-2">{survey.status !== "PUBLISHED" && <form action={changeSurveyStatusAction.bind(null, survey.id, "PUBLISHED")}><Button type="submit" size="sm">{survey.status === "DRAFT" ? "发布问卷" : "重新开放"}</Button></form>}{survey.status === "PUBLISHED" && <form action={changeSurveyStatusAction.bind(null, survey.id, "CLOSED")}><Button type="submit" size="sm" variant="outline">关闭回收</Button></form>}</div>}

        <div className="grid gap-4 sm:grid-cols-3">
          <Card><CardContent className="p-5"><div className="flex items-center gap-2 text-sm text-muted-foreground"><ClipboardList className="h-4 w-4 text-primary" />问题</div><div className="num mt-3 text-3xl font-bold">{survey.questions.length}</div></CardContent></Card>
          <Card><CardContent className="p-5"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Users className="h-4 w-4 text-primary" />已回收</div><div className="num mt-3 text-3xl font-bold">{survey.responses.length}<span className="ml-1 text-sm font-normal text-muted-foreground">/ {expectedTotal}</span></div></CardContent></Card>
          <Card><CardContent className="p-5"><div className="flex items-center gap-2 text-sm text-muted-foreground"><BarChart3 className="h-4 w-4 text-primary" />回收率</div><div className="num mt-3 text-3xl font-bold">{expectedTotal ? Math.round(survey.responses.length / expectedTotal * 100) : 0}%</div></CardContent></Card>
        </div>

        <Card><CardContent className="p-0"><div className="border-b border-border px-6 py-3 text-sm font-semibold">按班级回收</div><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead><tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground"><th className="px-6 py-3">班级</th><th className="px-6 py-3">应收</th><th className="px-6 py-3">已收</th><th className="px-6 py-3">回收率</th></tr></thead><tbody className="divide-y divide-border">{classStats.map((item) => <tr key={item.id}><td className="px-6 py-3 font-medium">{item.name}</td><td className="num px-6 py-3">{item.expected}</td><td className="num px-6 py-3">{item.responses}</td><td className="num px-6 py-3">{item.expected ? Math.round(item.responses / item.expected * 100) : 0}%</td></tr>)}</tbody></table></div></CardContent></Card>

        <section className="space-y-4"><h2 className="text-lg font-semibold">问题汇总</h2>{survey.questions.map((question, index) => {
          const options = Array.isArray(question.options) ? question.options.map(String) : [];
          const values = survey.responses.map((response) => answerRecord(response.answers)[question.id]);
          return <Card key={question.id}><CardContent className="p-5"><div className="flex items-start gap-2"><span className="num text-sm font-semibold text-primary">{index + 1}.</span><div><h3 className="text-sm font-medium">{question.title}</h3><p className="mt-1 text-xs text-muted-foreground">{question.required ? "必填" : "选填"} · {values.filter((value) => value !== undefined && value !== null && value !== "").length} 人回答</p></div></div>{question.type === "SHORT_TEXT" ? <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">{survey.responses.map((response) => { const value = answerRecord(response.answers)[question.id]; return typeof value === "string" && value.trim() ? <div key={response.id} className="rounded-md bg-muted/50 px-3 py-2 text-sm"><p>{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{response.student.name} · {response.student.class?.name ?? "未分班"}</p></div> : null; })}</div> : <div className="mt-4 space-y-2">{options.map((option) => { const count = values.filter((value) => Array.isArray(value) ? value.includes(option) : value === option).length; const percentage = survey.responses.length ? Math.round(count / survey.responses.length * 100) : 0; return <div key={option} className="grid grid-cols-[minmax(0,1fr)_80px] items-center gap-3"><div><div className="mb-1 flex justify-between text-xs"><span>{option}</span><span className="num text-muted-foreground">{count} 人</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${percentage}%` }} /></div></div><span className="num text-right text-xs text-muted-foreground">{percentage}%</span></div>; })}</div>}</CardContent></Card>;
        })}</section>
      </div></main>
    </>
  );
}
