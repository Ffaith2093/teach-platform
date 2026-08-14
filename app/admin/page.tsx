import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Topbar } from "@/components/shell/topbar";
import { Users, UserCog, BookOpen, Server } from "lucide-react";

export const metadata: Metadata = { title: "管理员工作台" };

export default function AdminDashboardPage() {
  return (
    <>
      <Topbar crumbs={[{ label: "工作台" }]} />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">管理员工作台</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">校信息中心</p>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { icon: Users, label: "学生总数", num: "—" },
              { icon: UserCog, label: "教师总数", num: "—" },
              { icon: BookOpen, label: "课程总数", num: "—" },
              { icon: Server, label: "评测队列", num: "0" },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <Card key={s.label}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <span className="text-sm text-muted-foreground">{s.label}</span>
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                        <Icon className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="mt-3 text-3xl font-bold tracking-tight text-muted-foreground/40 num">
                      {s.num}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="rounded-xl border border-dashed border-border bg-muted/40 p-8 text-center text-sm text-muted-foreground">
            <p>
              全站统计将在 P1 认证切片完成后接入；当前展示的是 P0 阶段基线布局。
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
