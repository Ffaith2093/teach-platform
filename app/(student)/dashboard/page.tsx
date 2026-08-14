import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Topbar } from "@/components/shell/topbar";
import { ArrowRight, Clock, FileText, GraduationCap } from "lucide-react";

export const metadata: Metadata = { title: "学生工作台" };

export default function StudentDashboardPage() {
  return (
    <>
      <Topbar crumbs={[{ label: "工作台" }]} />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">欢迎回来，示例学生</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">高一(1)班 · 信息学</p>
          </div>

          {/* 占位骨架：P3 之后会接真实数据 */}
          <Card>
            <CardContent className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold">待办</h2>
                <Badge variant="warning">3 项</Badge>
              </div>
              <ul className="divide-y divide-border">
                {[
                  { title: "Python 函数与递归 · 作业 4", due: "明天 23:59", icon: FileText, tone: "warning" as const },
                  { title: "期中考试 · Python 编程", due: "3 月 18 日 09:00", icon: GraduationCap, tone: "primary" as const },
                  { title: "数据结构 · 链表练习", due: "本周内完成", icon: Clock, tone: "muted" as const },
                ].map((t) => {
                  const Icon = t.icon;
                  return (
                    <li key={t.title} className="flex items-center gap-4 py-3.5">
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                          t.tone === "warning"
                            ? "bg-warning-subtle text-warning"
                            : t.tone === "primary"
                              ? "bg-primary-subtle text-primary"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{t.title}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">{t.due}</div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-subtle-foreground" />
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          <div className="rounded-xl border border-dashed border-border bg-muted/40 p-8 text-center text-sm text-muted-foreground">
            <p>
              工作台完整版将在 <b className="text-foreground">P3 题目与练习</b> 切片中实现（接入真实待办、课程、最近成绩数据）。
            </p>
            <Link href="/login" className="mt-2 inline-block text-xs text-primary hover:underline">
              ← 返回登录
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
