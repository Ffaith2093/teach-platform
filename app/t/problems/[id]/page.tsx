import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Topbar } from "@/components/shell/topbar";
import { relativeTime } from "@/lib/utils";
import { ChevronLeft, PlayCircle, Trash2 } from "lucide-react";
import { ProblemEditor } from "../_components/problem-editor";
import { ProblemActions } from "./_components/problem-actions";
import type { Difficulty } from "@prisma/client";

export const metadata = { title: "编辑编程题" };

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  EASY: "入门",
  MEDIUM: "中等",
  HARD: "进阶",
};

export default async function EditProblemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userId = session!.user.id;

  const problem = await prisma.problem.findUnique({
    where: { id },
    include: {
      testCases: { orderBy: { order: "asc" } },
      _count: {
        select: { assignmentProblems: true, questions: true },
      },
    },
  });
  if (!problem) notFound();

  // 仅作者可编辑
  if (problem.authorId !== userId) redirect("/t/problems?error=forbidden");

  const refCount = problem._count.assignmentProblems + problem._count.questions;
  const diff = DIFFICULTY_LABELS[problem.difficulty];

  return (
    <>
      <Topbar
        crumbs={[
          { label: "我的编程题", href: "/t/problems" },
          { label: problem.title },
        ]}
      />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1024px] flex-col gap-6">
          <div>
            <Link
              href="/t/problems"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-3 w-3" />
              返回我的编程题
            </Link>
            <div className="mt-2 flex items-end justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight">{problem.title}</h1>
                  <Badge variant="primary">{diff}</Badge>
                  {problem.isPublic && <Badge variant="success">已共享</Badge>}
                  {refCount > 0 && (
                    <Badge variant="default" className="font-normal">
                      已被引用 {refCount} 次
                    </Badge>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  创建于 {relativeTime(problem.createdAt)} · 更新于 {relativeTime(problem.updatedAt)}
                </p>
              </div>
              <ProblemActions
                problemId={problem.id}
                hasRefs={refCount > 0}
              />
            </div>
          </div>

          {refCount > 0 && (
            <div className="rounded-xl border border-warning/40 bg-warning-subtle/30 p-3 text-xs text-warning">
              该题已被 <b className="num">{refCount}</b> 处引用（作业 / 题库），无法删除。
              可修改基本信息或测试用例。
            </div>
          )}

          <ProblemEditor
            mode="edit"
            problemId={problem.id}
            initial={{
              title: problem.title,
              description: problem.description,
              difficulty: problem.difficulty,
              timeLimitMs: problem.timeLimitMs,
              memoryLimitMb: problem.memoryLimitMb,
              starterCode: problem.starterCode ?? "",
              referenceSolution: problem.referenceSolution ?? "",
              tags: problem.tags,
              isPublic: problem.isPublic,
            }}
            testCases={problem.testCases.map((tc) => ({
              id: tc.id,
              input: tc.input,
              expected: tc.expected,
              isSample: tc.isSample,
              score: tc.score,
              order: tc.order,
            }))}
          />
        </div>
      </main>
    </>
  );
}