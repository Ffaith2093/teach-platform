import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Topbar } from "@/components/shell/topbar";
import { ChevronLeft, Clock } from "lucide-react";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "提交详情" };

const STATUS_TONE: Record<
  string,
  "success" | "warning" | "danger" | "default"
> = {
  ACCEPTED: "success",
  WRONG_ANSWER: "warning",
  TLE: "danger",
  MLE: "danger",
  RUNTIME_ERROR: "danger",
  COMPILE_ERROR: "danger",
  SYSTEM_ERROR: "danger",
  PENDING: "default",
  JUDGING: "default",
};

const STATUS_LABEL: Record<string, string> = {
  ACCEPTED: "通过",
  WRONG_ANSWER: "答案错误",
  TLE: "运行超时",
  MLE: "内存超限",
  RUNTIME_ERROR: "运行错误",
  COMPILE_ERROR: "编译错误",
  SYSTEM_ERROR: "系统异常",
  PENDING: "等待中",
  JUDGING: "评测中",
};

const CONTEXT_LABEL: Record<string, string> = {
  PRACTICE: "题库练习",
  ASSIGNMENT: "作业",
  EXAM: "考试",
};

export default async function AdminSubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/admin?error=forbidden");

  const { id } = await params;
  const submission = await prisma.submission.findUnique({
    where: { id },
    include: {
      problem: { select: { id: true, title: true } },
      user: { select: { id: true, name: true, studentNo: true, email: true } },
      judgeCases: {
        orderBy: { testCase: { order: "asc" } },
        select: {
          status: true,
          timeMs: true,
          actualOutput: true,
          testCase: { select: { order: true, isSample: true } },
        },
      },
    },
  });
  if (!submission) notFound();

  const tone = STATUS_TONE[submission.status] ?? "default";
  const label = STATUS_LABEL[submission.status] ?? submission.status;

  return (
    <>
      <Topbar
        crumbs={[
          { label: "评测队列", href: "/admin/judge" },
          { label: `Submission ${submission.id.slice(0, 8)}` },
        ]}
      />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
          <div>
            <Link
              href="/admin/judge"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-3 w-3" />
              返回评测队列
            </Link>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">
                提交详情
              </h1>
              <Badge variant={tone}>{label}</Badge>
              <span className="font-mono text-xs text-muted-foreground">
                {submission.id}
              </span>
            </div>
          </div>

          {/* 元信息 */}
          <Card>
            <CardContent className="grid grid-cols-2 gap-x-8 gap-y-3 p-6 text-sm md:grid-cols-4">
              <Field label="提交者">
                {submission.user.name}{" "}
                <span className="text-subtle-foreground num">
                  {submission.user.studentNo ?? ""}
                </span>
              </Field>
              <Field label="题目">
                <Link
                  href={`/t/banks/preview/${submission.problem.id}`}
                  className="text-primary hover:underline"
                >
                  {submission.problem.title}
                </Link>
              </Field>
              <Field label="场景">{CONTEXT_LABEL[submission.contextType] ?? submission.contextType}</Field>
              <Field label="语言">{submission.language}</Field>
              <Field label="得分">
                <span className="num">
                  {submission.score} / {submission.totalCount * 10}
                </span>
              </Field>
              <Field label="通过">
                <span className="num">
                  {submission.passedCount} / {submission.totalCount}
                </span>
              </Field>
              <Field label="最大耗时">
                <span className="num">
                  {submission.maxTimeMs != null ? `${submission.maxTimeMs}ms` : "—"}
                </span>
              </Field>
              <Field label="提交时间">
                <span className="num">{formatDate(submission.createdAt)}</span>
              </Field>
            </CardContent>
          </Card>

          {/* 错误信息（失败时） */}
          {submission.errorMsg && (
            <Card>
              <CardContent className="p-6">
                <h2 className="text-base font-semibold">错误信息</h2>
                <pre className="mt-3 overflow-x-auto rounded-lg border border-danger/30 bg-danger-subtle/40 p-3 font-mono text-xs text-danger">
                  {submission.errorMsg}
                </pre>
              </CardContent>
            </Card>
          )}

          {/* 评测用例 */}
          <Card>
            <CardContent className="p-6">
              <h2 className="mb-4 text-base font-semibold">评测用例</h2>
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">#</th>
                      <th className="px-3 py-2 text-left font-medium">类型</th>
                      <th className="px-3 py-2 text-left font-medium">状态</th>
                      <th className="px-3 py-2 text-right font-medium">耗时</th>
                      <th className="px-3 py-2 text-left font-medium">实际输出</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {submission.judgeCases.map((c, i) => {
                      const t = STATUS_TONE[c.status] ?? "default";
                      return (
                        <tr key={i} className="transition-colors hover:bg-muted/30">
                          <td className="px-3 py-2 num font-mono text-xs text-muted-foreground">
                            {c.testCase.order}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {c.testCase.isSample ? "样例" : "隐藏"}
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant={t}>
                              {STATUS_LABEL[c.status] ?? c.status}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-right num text-xs text-muted-foreground">
                            <Clock className="mr-0.5 inline h-3 w-3" />
                            {c.timeMs ?? 0}ms
                          </td>
                          <td className="px-3 py-2">
                            <pre className="max-w-md overflow-x-auto whitespace-pre font-mono text-[11px] text-foreground">
                              {c.actualOutput ?? "（无输出）"}
                            </pre>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* 代码 */}
          <Card>
            <CardContent className="p-6">
              <h2 className="mb-3 text-base font-semibold">代码</h2>
              <pre className="max-h-[480px] overflow-auto rounded-lg border border-border bg-muted/30 p-4 font-mono text-xs leading-relaxed text-foreground">
                {submission.code}
              </pre>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-foreground">{children}</div>
    </div>
  );
}