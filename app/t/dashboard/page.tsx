import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Topbar } from "@/components/shell/topbar";
import { Users, FileText, ClipboardCheck } from "lucide-react";

export const metadata: Metadata = { title: "教师工作台" };

export default function TeacherDashboardPage() {
  return (
    <>
      <Topbar crumbs={[{ label: "工作台" }]} />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">王建国老师</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">信息技术 · 高一段</p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              { icon: Users, label: "我教的班级", num: "3", foot: "高一(1)/(3)/(5) 班" },
              { icon: FileText, label: "本周提交", num: "248", foot: "覆盖 5 门课程" },
              { icon: ClipboardCheck, label: "待批改", num: "24", foot: "作业 + 编程题", tone: "warning" as const },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <Card key={s.label} className="hover:border-primary/40 hover:shadow-md">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <span className="text-sm text-muted-foreground">{s.label}</span>
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                          s.tone === "warning" ? "bg-warning-subtle text-warning" : "bg-primary-subtle text-primary"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="mt-3 text-3xl font-bold tracking-tight num">{s.num}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{s.foot}</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="rounded-xl border border-dashed border-border bg-muted/40 p-8 text-center text-sm text-muted-foreground">
            <p>
              今日课程、班级整体动态、近期成绩等模块将在 <b className="text-foreground">P4 课程与资源</b> 切片中实现。
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
