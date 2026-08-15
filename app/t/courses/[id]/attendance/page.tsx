import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Topbar } from "@/components/shell/topbar";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Activity } from "lucide-react";

export const metadata = { title: "出勤明细" };

export default async function AttendanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: courseId } = await params;
  const session = await auth();
  const userId = session!.user.id;

  // 教师必须在课程团队里
  const myMembership = await prisma.courseTeacher.findUnique({
    where: { courseId_teacherId: { courseId, teacherId: userId } },
  });
  if (!myMembership) redirect("/t/courses?error=forbidden");

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, title: true },
  });
  if (!course) notFound();

  // 应到学生（课程下所有班级 ACTIVE STUDENT）
  const expectedStudents = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      role: "STUDENT",
      classId: {
        in: (
          await prisma.courseClass.findMany({
            where: { courseId },
            select: { classId: true },
          })
        ).map((cc) => cc.classId),
      },
    },
    select: { id: true, name: true, studentNo: true, class: { select: { name: true } } },
    orderBy: [{ studentNo: "asc" }, { name: "asc" }],
  });

  // 30 天窗口
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 29);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  const logs = await prisma.accessLog.findMany({
    where: {
      courseId,
      createdAt: { gte: thirtyDaysAgo },
      userId: { in: expectedStudents.map((s) => s.id) },
    },
    select: { userId: true, createdAt: true },
  });

  // userId -> Set<date-string>
  const userDays = new Map<string, Set<string>>();
  for (const log of logs) {
    const day = log.createdAt.toISOString().slice(0, 10);
    if (!userDays.has(log.userId)) userDays.set(log.userId, new Set());
    userDays.get(log.userId)!.add(day);
  }

  // 30 天列（按时间正序，今天在最右）
  const columns: { date: string; label: string; weekday: string; isToday: boolean }[] = [];
  const todayKey = dayStart.toISOString().slice(0, 10);
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString().slice(0, 10);
    columns.push({
      date: key,
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      weekday: ["日", "一", "二", "三", "四", "五", "六"][d.getDay()],
      isToday: key === todayKey,
    });
  }

  // 顶部汇总
  const todayPresentSet = new Set<string>();
  const past7Cutoff = new Date(now);
  past7Cutoff.setDate(now.getDate() - 6);
  past7Cutoff.setHours(0, 0, 0, 0);
  let past7Sum = 0;
  for (const log of logs) {
    if (log.createdAt >= dayStart) todayPresentSet.add(log.userId);
    if (log.createdAt >= past7Cutoff) past7Sum++;
  }
  const todayPresentCount = todayPresentSet.size;
  const avg30Rate =
    expectedStudents.length === 0
      ? 0
      : expectedStudents.reduce((s, stu) => s + (userDays.get(stu.id)?.size ?? 0), 0) /
        (expectedStudents.length * 30);
  const totalAbsent = expectedStudents.filter((s) => !userDays.has(s.id) || userDays.get(s.id)!.size === 0).length;

  return (
    <>
      <Topbar
        crumbs={[
          { label: "我的课程", href: "/t/courses" },
          { label: course.title, href: `/t/courses/${courseId}` },
          { label: "出勤明细" },
        ]}
      />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div>
            <Link
              href={`/t/courses/${courseId}`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-3 w-3" />
              返回课程详情
            </Link>
            <div className="mt-2 flex items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <Activity className="h-5 w-5 text-primary" />
                  <h1 className="text-2xl font-semibold tracking-tight">出勤明细</h1>
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {course.title} · 过去 30 天每天到课情况（基于学生访问课程页的打点）
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-success" />
                  到课
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-muted-foreground/20" />
                  未到
                </span>
              </div>
            </div>
          </div>

          {/* 汇总 */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <SummaryCard label="今日到课" value={todayPresentCount} total={expectedStudents.length} tone="primary" />
            <SummaryCard
              label="7 天总到课人次"
              value={past7Sum}
              tone="accent"
            />
            <SummaryCard
              label="30 天平均出勤率"
              value={`${Math.round(avg30Rate * 100)}%`}
              tone={avg30Rate >= 0.6 ? "success" : avg30Rate >= 0.3 ? "warning" : "danger"}
            />
            <SummaryCard
              label="30 天从未到课"
              value={totalAbsent}
              tone={totalAbsent === 0 ? "success" : "danger"}
            />
          </div>

          {/* 日历矩阵 */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                      <th className="sticky left-0 z-10 bg-muted/50 px-4 py-3">学生</th>
                      {columns.map((c) => (
                        <th
                          key={c.date}
                          className={`px-1 py-2 text-center text-[10px] num ${
                            c.isToday ? "text-primary" : "text-subtle-foreground"
                          }`}
                          title={c.date}
                        >
                          <div>{c.weekday}</div>
                          <div className="num">{c.label}</div>
                        </th>
                      ))}
                      <th className="px-4 py-3 text-right">30 天到课</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {expectedStudents.length === 0 ? (
                      <tr>
                        <td colSpan={columns.length + 2} className="px-6 py-16 text-center text-sm text-muted-foreground">
                          课程下暂无学生
                        </td>
                      </tr>
                    ) : (
                      expectedStudents.map((s) => {
                        const days = userDays.get(s.id) ?? new Set<string>();
                        const count = days.size;
                        return (
                          <tr key={s.id} className="hover:bg-muted/30">
                            <td className="sticky left-0 z-10 bg-card px-4 py-2.5 group-hover:bg-muted/30">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[11px] text-muted-foreground num">
                                  {s.studentNo ?? "—"}
                                </span>
                                <span className="font-medium text-foreground">{s.name}</span>
                              </div>
                              {s.class?.name && (
                                <div className="mt-0.5 text-[10px] text-subtle-foreground">
                                  {s.class.name}
                                </div>
                              )}
                            </td>
                            {columns.map((c) => {
                              const present = days.has(c.date);
                              return (
                                <td key={c.date} className="px-1 py-2.5 text-center">
                                  {present ? (
                                    <div
                                      className={`mx-auto h-4 w-4 rounded-sm ${
                                        c.isToday ? "bg-primary" : "bg-success"
                                      }`}
                                      title={`${c.date} 到课`}
                                    />
                                  ) : (
                                    <div
                                      className="mx-auto h-4 w-4 rounded-sm bg-muted-foreground/10"
                                      title={`${c.date} 未到`}
                                    />
                                  )}
                                </td>
                              );
                            })}
                            <td className="px-4 py-2.5 text-right">
                              <Badge variant={count >= 20 ? "success" : count >= 10 ? "warning" : "danger"}>
                                <span className="num">{count}</span>
                                <span className="text-subtle-foreground"> / 30</span>
                              </Badge>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* 30 天从未到过的学生 */}
          {totalAbsent > 0 && (
            <Card>
              <CardContent className="p-6">
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="text-base font-semibold">30 天从未到课</h2>
                  <Badge variant="danger">{totalAbsent} 人</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {expectedStudents
                    .filter((s) => !userDays.has(s.id) || userDays.get(s.id)!.size === 0)
                    .map((s) => (
                      <span
                        key={s.id}
                        className="inline-flex items-center gap-1.5 rounded-md border border-danger/30 bg-danger-subtle/40 px-2 py-1 text-xs"
                      >
                        <span className="font-mono text-[10px] text-muted-foreground num">
                          {s.studentNo ?? "—"}
                        </span>
                        <span className="font-medium text-foreground">{s.name}</span>
                      </span>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </>
  );
}

function SummaryCard({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number | string;
  total?: number;
  tone: "primary" | "accent" | "success" | "warning" | "danger";
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold tracking-tight num">{value}</span>
          {typeof total === "number" && (
            <span className="text-xs text-subtle-foreground num">/ {total}</span>
          )}
        </div>
        <div
          className={`mt-2 h-1 w-full rounded-full ${
            tone === "success"
              ? "bg-success-subtle"
              : tone === "warning"
                ? "bg-warning-subtle"
                : tone === "danger"
                  ? "bg-danger-subtle"
                  : tone === "primary"
                    ? "bg-primary-subtle"
                    : "bg-accent-subtle"
          }`}
        />
      </CardContent>
    </Card>
  );
}