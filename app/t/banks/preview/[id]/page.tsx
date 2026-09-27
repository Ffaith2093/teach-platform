import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/shell/topbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StudentQuestionView } from "@/components/question-preview";
import { ArrowLeft, Pencil, Tag, Hash, User, Library } from "lucide-react";
import { relativeTime } from "@/lib/utils";
import type { Difficulty, QuestionType } from "@prisma/client";

export const metadata = { title: "题目预览" };

const DIFFICULTY_LABELS: Record<Difficulty, { label: string; tone: "success" | "warning" | "danger" }> = {
  EASY: { label: "入门", tone: "success" },
  MEDIUM: { label: "中等", tone: "warning" },
  HARD: { label: "进阶", tone: "danger" },
};

const TYPE_LABEL: Record<string, string> = {
  SINGLE_CHOICE: "选择题",
  MULTIPLE_CHOICE: "多选题",
  TRUE_FALSE: "判断题",
  FILL_BLANK: "填空题",
  CODE_BLANK: "代码填空",
  SHORT_ANSWER: "简答题",
  ESSAY: "论述题",
  PROGRAMMING: "编程题",
};

function backHrefForQuestionType(t: string): string {
  if (t === "FILL_BLANK" || t === "CODE_BLANK") return "/t/banks/fill";
  return "/t/banks/choice";
}

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, "[代码]")
    .replace(/!\[.*?\]\(.*?\)/g, "[图片]")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`>#-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userId = session!.user.id;
  const isAdmin = session!.user.role === "ADMIN";

  // 先查 Question（含 bank 信息）
  const question = await prisma.question.findUnique({
    where: { id },
    include: {
      bank: { select: { id: true, name: true, ownerId: true } },
      _count: { select: { examQuestions: true } },
    },
  });

  if (question) {
    const options = (question.options as { key: string; text: string }[] | null) ?? [];
    const isOwner = question.bank?.ownerId === userId;
    const canEdit = isOwner || isAdmin;
    const backHref = backHrefForQuestionType(question.type);
    const typeLabel = TYPE_LABEL[question.type] ?? "题目";
    const diff = DIFFICULTY_LABELS[question.difficulty];
    const editHref = question.bank ? `/t/banks/${question.bank.id}` : null;
    const refCount = question._count.examQuestions;
    const title = stripMarkdown(question.content).slice(0, 80) || "（无题干）";

    return (
      <>
        <Topbar
          crumbs={[
            { label: "题库", href: backHref },
            { label: typeLabel, href: backHref },
            { label: "预览" },
          ]}
        />
        <main className="flex-1 p-8">
          <div className="mx-auto flex max-w-3xl flex-col gap-6">
            <div>
              <Link
                href={backHref}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="h-3 w-3" />
                返回{typeLabel}列表
              </Link>
              <div className="mt-2 flex items-end justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
                    <Badge variant="default">{typeLabel}</Badge>
                    <Badge variant={diff.tone}>{diff.label}</Badge>
                    {question.score > 0 && (
                      <Badge variant="primary" className="font-normal">
                        {question.score} 分
                      </Badge>
                    )}
                    {refCount > 0 && (
                      <Badge variant="default" className="font-normal">
                        已被引用 {refCount} 次
                      </Badge>
                    )}
                    {isOwner ? (
                      <Badge variant="primary" className="font-normal">我的</Badge>
                    ) : (
                      <Badge variant="default" className="font-normal">公共</Badge>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {question.bank ? (
                      <span className="inline-flex items-center gap-1">
                        <Library className="h-3 w-3" />
                        所属题库：
                        <Link
                          href={`/t/banks/${question.bank.id}`}
                          className="text-foreground transition-colors hover:text-primary"
                        >
                          {question.bank.name}
                        </Link>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <Library className="h-3 w-3" />
                        所属题库：—
                      </span>
                    )}
                  </div>
                </div>
                {canEdit && editHref && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={editHref}>
                      <Pencil className="h-4 w-4" />
                      编辑题目
                    </Link>
                  </Button>
                )}
              </div>
            </div>

            {refCount > 0 && (
              <div className="rounded-xl border border-warning/40 bg-warning-subtle/30 p-3 text-xs text-warning">
                该题已被 <b className="num">{refCount}</b> 处试卷引用。修改后所有引用处会同步更新。
              </div>
            )}

            <StudentQuestionView
              q={{
                type: question.type as QuestionType,
                content: question.content,
                difficulty: question.difficulty as Difficulty,
                score: question.score,
                index: 1,
                options,
              }}
            />
          </div>
        </main>
      </>
    );
  }

  // 再查 Problem
  const problem = await prisma.problem.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, name: true } },
      _count: {
        select: {
          testCases: true,
          assignmentProblems: true,
          questions: true,
        },
      },
    },
  });

  if (problem) {
    const isOwner = problem.author.id === userId;
    const canEdit = isOwner || isAdmin;
    const diff = DIFFICULTY_LABELS[problem.difficulty];
    const refCount = problem._count.assignmentProblems + problem._count.questions;

    return (
      <>
        <Topbar
          crumbs={[
            { label: "题库", href: "/t/banks/programming" },
            { label: "编程题", href: "/t/banks/programming" },
            { label: "预览" },
          ]}
        />
        <main className="flex-1 p-8">
          <div className="mx-auto flex max-w-3xl flex-col gap-6">
            <div>
              <Link
                href="/t/banks/programming"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="h-3 w-3" />
                返回编程题列表
              </Link>
              <div className="mt-2 flex items-end justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-semibold tracking-tight">{problem.title}</h1>
                    <Badge variant="default">编程题</Badge>
                    <Badge variant={diff.tone}>{diff.label}</Badge>
                    {problem.isPublic && (
                      <Badge variant="success" className="font-normal">
                        已共享
                      </Badge>
                    )}
                    {refCount > 0 && (
                      <Badge variant="default" className="font-normal">
                        已被引用 {refCount} 次
                      </Badge>
                    )}
                    {isOwner ? (
                      <Badge variant="primary" className="font-normal">我的</Badge>
                    ) : (
                      <Badge variant="default" className="font-normal">他人创建</Badge>
                    )}
                  </div>
                  {problem.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {problem.tags.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                        >
                          <Tag className="mr-0.5 h-3 w-3" />
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <User className="h-3 w-3" />
                      作者：{problem.author.name}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Hash className="h-3 w-3" />
                      {problem._count.testCases} 个测试用例
                    </span>
                    <span>
                      创建于 {relativeTime(problem.createdAt)} · 更新于 {relativeTime(problem.updatedAt)}
                    </span>
                  </div>
                </div>
                {canEdit && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/t/problems/${problem.id}`}>
                      <Pencil className="h-4 w-4" />
                      编辑题目
                    </Link>
                  </Button>
                )}
              </div>
            </div>

            {refCount > 0 && (
              <div className="rounded-xl border border-warning/40 bg-warning-subtle/30 p-3 text-xs text-warning">
                该题已被 <b className="num">{refCount}</b> 处引用（作业 / 题库），无法删除。可修改基本信息和测试用例。
              </div>
            )}

            <StudentQuestionView
              q={{
                type: "PROGRAMMING" as QuestionType,
                content: problem.title,
                difficulty: problem.difficulty as Difficulty,
                score: 0,
                index: 1,
                problem: {
                  title: problem.title,
                  description: problem.description,
                  starterCode: problem.starterCode ?? "",
                },
              }}
            />
          </div>
        </main>
      </>
    );
  }

  notFound();
}