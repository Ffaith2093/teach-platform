import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock } from "lucide-react";

export const metadata: Metadata = { title: "登录" };

export default function LoginPage() {
  return (
    <main className="grid min-h-[calc(100vh-4rem)] place-items-center bg-gradient-to-b from-primary-subtle/30 via-background to-background px-4 py-12">
      <Card className="w-full max-w-md animate-fade-up">
        <CardContent className="space-y-6 p-8">
          <div className="space-y-1.5 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary-subtle text-primary">
              <Lock className="h-5 w-5" />
            </div>
            <h1 className="mt-3 text-xl font-semibold">登录 PyLearn</h1>
            <p className="text-sm text-muted-foreground">教师与学生账号由管理员统一创建</p>
          </div>
          <form className="space-y-4" action="/dashboard">
            <div className="space-y-1.5">
              <Label htmlFor="email">邮箱 / 学号 / 工号</Label>
              <Input id="email" name="email" placeholder="zhang.san@school.edu" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">密码</Label>
              <Input id="password" name="password" type="password" placeholder="••••••••" required />
            </div>
            <Button type="submit" className="w-full" size="lg">
              登录
            </Button>
          </form>
          <div className="rounded-lg border border-warning/30 bg-warning-subtle/40 p-3 text-xs text-muted-foreground">
            <b className="text-warning">首次登录？</b> 请使用管理员下发的初始密码登录，登录后强制跳转到修改密码页。
          </div>
          <div className="grid grid-cols-3 gap-2 pt-2">
            {[
              { role: "学生", href: "/dashboard" },
              { role: "教师", href: "/t/dashboard" },
              { role: "管理员", href: "/admin" },
            ].map((r) => (
              <Link
                key={r.role}
                href={r.href}
                className="rounded-md border border-border bg-card px-3 py-2 text-center text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                演示 · {r.role}
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
