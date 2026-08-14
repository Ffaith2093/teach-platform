import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Topbar } from "@/components/shell/topbar";
import { ChevronLeft, AlertTriangle } from "lucide-react";
import { TestRunner } from "./_components/test-runner";
import type { Difficulty } from "@prisma/client";

export const metadata = { title: "验证用例" };

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  EASY: "入门",
  MEDIUM: "中等",
  HARD: "进阶",
};

export default async function TestProblemPage({
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
    },
  });
  if (!problem) notFound();
  if (problem.authorId !== userId) redirect("/t/problems?error=forbidden");

  const diff = DIFFICULTY_LABELS[problem.difficulty];
  const sampleCount = problem.testCases.filter((t) => t.isSample).length;
  const hiddenCount = problem.testCases.length - sampleCount;
  const totalScore = problem.testCases.reduce((s, t) => s + t.score, 0);

  return (
    <>
      <Topbar
        crumbs={[
          { label: "我的编程题", href: "/t/problems" },
          { label: problem.title, href: `/t/problems/${problem.id}` },
          { label: "验证用例" },
        ]}
      />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div>
            <Link
              href={`/t/problems/${problem.id}`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-3 w-3" />
              返回编辑题目
            </Link>
            <div className="mt-2 flex items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight">
                    验证用例 · {problem.title}
                  </h1>
                  <Badge variant="primary">{diff}</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  用「参考答案」运行全部测试用例，确认题目正确性后再发布。
                </p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <div>
                  共 <span className="num text-foreground">{problem.testCases.length}</span> 个用例
                  （样例 <span className="num text-foreground">{sampleCount}</span> + 隐藏{" "}
                  <span className="num text-foreground">{hiddenCount}</span>）·{" "}
                  总分 <span className="num text-foreground">{totalScore}</span>
                </div>
                <div className="mt-1">
                  时间限制 <span className="num text-foreground">{problem.timeLimitMs}ms</span>{" "}
                  · 内存{" "}
                  <span className="num text-foreground">{problem.memoryLimitMb}MB</span>
                </div>
              </div>
            </div>
          </div>

          {!problem.referenceSolution?.trim() && (
            <div className="rounded-xl border border-warning/40 bg-warning-subtle/40 p-4 text-sm text-warning">
              <AlertTriangle className="mr-1.5 inline h-4 w-4" />
              该题尚未填写「参考答案」，无法运行验证。请先到{" "}
              <Link
                href={`/t/problems/${problem.id}`}
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                编辑题目
              </Link>{" "}
              补充。
            </div>
          )}

          <TestRunner
            problemId={problem.id}
            initialTestCases={problem.testCases.map((tc, i) => ({
              id: tc.id,
              order: i,
              isSample: tc.isSample,
              input: tc.input,
              expected: tc.expected,
              score: tc.score,
            }))}
            hasRef={!!problem.referenceSolution?.trim()}
          />
        </div>
      </main>
    </>
  );
}