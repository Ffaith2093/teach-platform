import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldAlert } from "lucide-react";

export const metadata: Metadata = { title: "修改密码" };

export default function ChangePasswordPage() {
  return (
    <main className="grid min-h-[calc(100vh-4rem)] place-items-center bg-gradient-to-b from-primary-subtle/30 via-background to-background px-4 py-12">
      <Card className="w-full max-w-md animate-fade-up">
        <CardContent className="space-y-6 p-8">
          <div className="space-y-1.5 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-warning-subtle text-warning">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <h1 className="mt-3 text-xl font-semibold">请修改初始密码</h1>
            <p className="text-sm text-muted-foreground">首次登录需修改密码后才能进入系统</p>
          </div>
          <form className="space-y-4" action="/dashboard">
            <div className="space-y-1.5">
              <Label htmlFor="old">当前密码</Label>
              <Input id="old" type="password" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new">新密码</Label>
              <Input id="new" type="password" required />
              <p className="text-xs text-subtle-foreground">至少 8 位，包含字母与数字</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">确认新密码</Label>
              <Input id="confirm" type="password" required />
            </div>
            <Button type="submit" className="w-full" size="lg">
              提交并进入系统
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
