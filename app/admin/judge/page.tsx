import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getJudgeQueue } from "@/lib/judge/queue";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Topbar } from "@/components/shell/topbar";
import { relativeTime } from "@/lib/utils";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Hourglass,
  Loader2,
  Server,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { RejudgeButton } from "./_components/rejudge-button";

export const metadata = { title: "评测队列监控" };

// BullMQ Job state literals（不依赖 enum，避免类型耦合）
type JobState = "active" | "waiting" | "completed" | "failed" | "delayed" | "paused";

export default async function AdminJudgePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/admin?error=forbidden");

  let queueError: string | null = null;
  let counts = { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 };
  let recentFailed: Awaited<ReturnType<ReturnType<typeof getJudgeQueue>["getJobs"]>> = [];
  let recentActive: typeof recentFailed = [];

  try {
    const queue = getJudgeQueue();
    const rawCounts = (await queue.getJobCounts()) as Record<string, number>;
    counts = {
      waiting: rawCounts.waiting ?? 0,
      active: rawCounts.active ?? 0,
      completed: rawCounts.completed ?? 0,
      failed: rawCounts.failed ?? 0,
      delayed: rawCounts.delayed ?? 0,
      paused: rawCounts.paused ?? 0,
    };
    const [failed, active] = await Promise.all([
      queue.getJobs("failed", 0, 9),
      queue.getJobs("active", 0, 9),
    ]);
    recentFailed = failed;
    recentActive = active;
  } catch (e) {
    queueError = (e as Error).message;
  }

  const total = counts.waiting + counts.active + counts.delayed;
  const finished = counts.completed + counts.failed;
  const failRate = finished === 0 ? 0 : (counts.failed / finished) * 100;

  const stats = [
    {
      icon: Server,
      label: "队列长度",
      value: total,
      sub: `待处理 ${counts.waiting} · 进行中 ${counts.active} · 延迟 ${counts.delayed}`,
      tone: "primary" as const,
    },
    {
      icon: CheckCircle2,
      label: "已完成",
      value: counts.completed,
      sub: "累计成功评测",
      tone: "success" as const,
    },
    {
      icon: AlertCircle,
      label: "失败",
      value: counts.failed,
      sub: `失败率 ${failRate.toFixed(1)}%`,
      tone: failRate > 20 ? ("danger" as const) : failRate > 5 ? ("warning" as const) : ("muted" as const),
    },
    {
      icon: Activity,
      label: "Worker 状态",
      value: counts.active > 0 ? "运行中" : "空闲",
      sub: counts.active > 0 ? `${counts.active} 个 job 在跑` : "等待新任务",
      tone: counts.active > 0 ? ("warning" as const) : ("muted" as const),
    },
  ];

  // 失败 job 关联的 submission 信息
  const failedSubmissionIds = recentFailed
    .map((j) => (j.data as { submissionId?: string }).submissionId)
    .filter((id): id is string => Boolean(id));
  const failedSubs = failedSubmissionIds.length
    ? await prisma.submission.findMany({
        where: { id: { in: failedSubmissionIds } },
        select: {
          id: true,
          status: true,
          errorMsg: true,
          contextType: true,
          contextId: true,
          user: { select: { id: true, name: true } },
        },
      })
    : [];
  const subById = new Map(failedSubs.map((s) => [s.id, s]));

  return (
    <>
      <Topbar crumbs={[{ label: "评测队列" }]} />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">评测队列监控</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              SPEC §7：BullMQ 队列长度 / 失败率 / Worker 状态。仅管理员可见。
            </p>
          </div>

          {queueError && (
            <Card>
              <CardContent className="flex items-start gap-3 border-danger/30 bg-danger-subtle/30 p-5 text-sm">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                <div>
                  <p className="font-medium text-danger">无法连接 Redis 队列</p>
                  <p className="mt-1 text-xs text-muted-foreground">{queueError}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    请确认 <code className="rounded bg-muted px-1">REDIS_URL</code> 已设置且 docker-compose 起的 Redis 可达。
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 概览卡 */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {stats.map((s) => {
              const Icon = s.icon;
              return (
                <Card key={s.label}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <span className="text-sm text-muted-foreground">{s.label}</span>
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                          s.tone === "primary"
                            ? "bg-primary-subtle text-primary"
                            : s.tone === "success"
                              ? "bg-success-subtle text-success"
                              : s.tone === "warning"
                                ? "bg-warning-subtle text-warning"
                                : s.tone === "danger"
                                  ? "bg-danger-subtle text-danger"
                                  : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="mt-3 text-3xl font-bold tracking-tight num">{s.value}</div>
                    <p className="mt-1 text-xs text-subtle-foreground">{s.sub}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* 队列状态分布 */}
          <Card>
            <CardContent className="p-6">
              <h2 className="mb-4 text-base font-semibold">队列状态分布</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  { label: "等待中", count: counts.waiting, icon: Hourglass, tone: "primary" as const },
                  { label: "进行中", count: counts.active, icon: Loader2, tone: "warning" as const },
                  { label: "已完成", count: counts.completed, icon: CheckCircle2, tone: "success" as const },
                  { label: "失败", count: counts.failed, icon: XCircle, tone: "danger" as const },
                  { label: "延迟", count: counts.delayed, icon: Clock, tone: "muted" as const },
                ].map((c) => {
                  const Icon = c.icon;
                  return (
                    <div
                      key={c.label}
                      className="rounded-xl border border-border bg-muted/30 p-4"
                    >
                      <div className="flex items-center justify-between">
                        <Icon
                          className={`h-4 w-4 ${
                            c.tone === "primary"
                              ? "text-primary"
                              : c.tone === "warning"
                                ? "text-warning"
                                : c.tone === "success"
                                  ? "text-success"
                                  : c.tone === "danger"
                                    ? "text-danger"
                                    : "text-muted-foreground"
                          } ${c.label === "进行中" && c.count > 0 ? "animate-spin" : ""}`}
                        />
                        <span className="num text-2xl font-semibold">{c.count}</span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">{c.label}</p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* 最近失败 */}
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <h2 className="text-base font-semibold">最近失败 (Top 10)</h2>
                {counts.failed > 0 && (
                  <Badge variant="danger">
                    <span className="num">{counts.failed}</span> 条
                  </Badge>
                )}
              </div>
              {recentFailed.length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-success" />
                  <p className="mt-2 text-sm font-medium text-foreground">无失败记录</p>
                  <p className="text-xs text-muted-foreground">评测队列稳定运行中</p>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {recentFailed.map((j) => {
                    const submissionId = (j.data as { submissionId?: string }).submissionId ?? "";
                    const sub = submissionId ? subById.get(submissionId) : null;
                    return (
                      <li key={j.id!} className="px-6 py-4">
                        <div className="flex items-start gap-3">
                          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs text-subtle-foreground">
                                Job {j.id!.slice(0, 10)}
                              </span>
                              {sub && (
                                <Link
                                  href={`/admin/judge/submissions/${sub.id}`}
                                  className="text-xs text-primary hover:underline"
                                >
                                  Submission {sub.id.slice(0, 8)}
                                </Link>
                              )}
                              <Badge variant="danger">{sub?.status ?? "FAILED"}</Badge>
                              <span className="ml-auto text-xs text-muted-foreground">
                                {relativeTime(new Date(j.timestamp))}
                              </span>
                              {sub && <RejudgeButton submissionId={sub.id} />}
                            </div>
                            {sub && (
                              <div className="mt-1 text-xs text-muted-foreground">
                                {sub.user.name} · {sub.contextType}
                                {sub.contextId && ` · ${sub.contextId.slice(0, 8)}`}
                              </div>
                            )}
                            {j.failedReason && (
                              <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-muted/40 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
                                {j.failedReason}
                              </pre>
                            )}
                            {sub?.errorMsg && !j.failedReason && (
                              <p className="mt-2 text-xs text-muted-foreground">{sub.errorMsg}</p>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* 当前进行中 */}
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <h2 className="text-base font-semibold">进行中 (Top 10)</h2>
                {counts.active > 0 && (
                  <Badge variant="warning">
                    <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                    <span className="num">{counts.active}</span> 个
                  </Badge>
                )}
              </div>
              {recentActive.length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <Hourglass className="mx-auto h-8 w-8 text-muted-foreground" />
                  <p className="mt-2 text-sm font-medium text-foreground">队列空闲</p>
                  <p className="text-xs text-muted-foreground">暂无正在评测的任务</p>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {recentActive.map((j) => {
                    const submissionId = (j.data as { submissionId?: string }).submissionId ?? "";
                    return (
                      <li key={j.id!} className="flex items-center gap-3 px-6 py-3">
                        <Loader2 className="h-4 w-4 animate-spin text-warning" />
                        <span className="font-mono text-xs text-subtle-foreground">
                          Job {j.id!.slice(0, 10)}
                        </span>
                        <Link
                          href={`/admin/judge/submissions/${submissionId}`}
                          className="text-xs text-primary hover:underline"
                        >
                          Submission {submissionId.slice(0, 8)}
                        </Link>
                        <span className="ml-auto text-xs text-muted-foreground">
                          已处理 {j.attemptsMade}/{j.opts?.attempts ?? 1} 次
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {relativeTime(new Date(j.timestamp))}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* 系统提示 */}
          <div className="rounded-xl border border-info/30 bg-info-subtle/40 p-3 text-xs text-info">
            <TrendingUp className="mr-1 inline h-3 w-3" />
            队列数据从 BullMQ 实时读取。失败率 &gt; 20% 标红、&gt; 5% 标黄。
          </div>
        </div>
      </main>
    </>
  );
}