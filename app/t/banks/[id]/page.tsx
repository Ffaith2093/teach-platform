import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Topbar } from "@/components/shell/topbar";
import { relativeTime } from "@/lib/utils";
import {
  ChevronLeft,
  Library,
} from "lucide-react";
import { BankMetaEditor } from "./_components/bank-meta-editor";
import { BankActions } from "./_components/bank-actions";
import { BankQuestionsPanel } from "./_components/bank-questions-panel";
import type { Difficulty, QuestionType } from "@prisma/client";

export const metadata = { title: "题库详情" };

export default async function BankDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await auth();
  const userId = session!.user.id;
  const isAdmin = session!.user.role === "ADMIN";

  const bank = await prisma.questionBank.findUnique({
    where: { id },
    include: {
      course: { select: { id: true, title: true } },
      questions: {
        orderBy: { id: "asc" },
        include: {
          problem: {
            select: {
              id: true,
              title: true,
              difficulty: true,
              tags: true,
              isPublic: true,
              authorId: true,
              _count: { select: { testCases: true } },
            },
          },
          _count: { select: { examQuestions: true } },
        },
      },
    },
  });
  if (!bank) notFound();
  if (bank.ownerId !== userId && !isAdmin) redirect("/t/banks?error=forbidden");

  // 我可以加入题库的编程题（本人 or 公开，且不在本库中）
  const usedProblemIds = new Set(
    bank.questions
      .filter((q) => q.problemId)
      .map((q) => q.problemId) as string[],
  );
  const availableProblems = await prisma.problem.findMany({
    where: {
      id: { notIn: [...usedProblemIds] },
      OR: [{ authorId: userId }, { isPublic: true }],
    },
    select: { id: true, title: true, difficulty: true, isPublic: true },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  // 我参与的课程（用于关联题库）
  const myCourses = await prisma.courseTeacher.findMany({
    where: {
      teacherId: userId,
      role: { in: ["OWNER", "ASSISTANT"] },
      course: { isArchived: false },
    },
    include: { course: { select: { id: true, title: true } } },
    orderBy: { course: { title: "asc" } },
  });

  // 组装给面板的数据
  const questions = bank.questions.map((q) => ({
    questionId: q.id,
    type: q.type as QuestionType,
    content: q.content,
    difficulty: q.difficulty as Difficulty,
    score: q.score,
    options: (q.options as { key: string; text: string }[] | null) ?? undefined,
    answer: (q.answer as string | string[] | null) ?? undefined,
    explanation: q.explanation,
    problemId: q.problemId ?? undefined,
    problemTitle: q.problem?.title,
    referencedByCount: q._count.examQuestions,
  }));

  return (
    <>
      <Topbar
        crumbs={[
          { label: "我的题库", href: "/t/banks" },
          { label: bank.name },
        ]}
      />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div>
            <Link
              href="/t/banks"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-3 w-3" />
              返回我的题库
            </Link>
            <div className="mt-2 flex items-end justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight">{bank.name}</h1>
                  {bank.course ? (
                    <Link
                      href={`/t/courses/${bank.course.id}`}
                      className="text-sm text-muted-foreground transition-colors hover:text-primary"
                    >
                      {bank.course.title}
                    </Link>
                  ) : (
                    <Badge variant="default" className="font-normal">
                      未关联课程
                    </Badge>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  创建于 {relativeTime(bank.createdAt)} · 共{" "}
                  <span className="num text-foreground">{questions.length}</span> 题
                </p>
              </div>
              <BankActions bankId={bank.id} questionCount={questions.length} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <BankQuestionsPanel
                bankId={bank.id}
                questions={questions}
                availableProblems={availableProblems.map((p) => ({
                  id: p.id,
                  title: p.title,
                  difficulty: p.difficulty,
                  isPublic: p.isPublic,
                }))}
                searchParams={{ type: sp.type }}
              />
            </div>

            <div className="space-y-6">
              <BankMetaEditor
                bankId={bank.id}
                initial={{
                  name: bank.name,
                  courseId: bank.courseId ?? "",
                }}
                courses={myCourses.map((m) => ({
                  id: m.course.id,
                  title: m.course.title,
                }))}
              />

              <Card>
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                      <Library className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-foreground">题库用途</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        题库用于按题型归类题目。可关联到一门课程，方便后续组卷时引用。
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}