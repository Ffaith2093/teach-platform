"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Eye, EyeOff, Check, GraduationCap, Presentation, ShieldCheck } from "lucide-react";

export function LoginForm() {
  const searchParams = useSearchParams();
  const [showPwd, setShowPwd] = React.useState(false);
  const [selectedRole, setSelectedRole] = React.useState<"STUDENT" | "TEACHER" | "ADMIN">("STUDENT");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const errorParam = searchParams.get("error");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);

    const formData = new FormData(event.currentTarget);
    try {
      const result = await signIn("credentials", {
        identifier: String(formData.get("identifier") ?? ""),
        password: String(formData.get("password") ?? ""),
        role: selectedRole,
        redirect: false,
      });

      if (result?.error) {
        setError("账号、密码或所选角色错误");
        return;
      }

      const response = await fetch("/api/auth/session", { cache: "no-store" });
      const session = response.ok ? await response.json() : null;
      if (!session?.user?.role) {
        setError("登录状态未能保存，请刷新页面后重试");
        return;
      }

      const destination =
        session.user.role === "ADMIN"
          ? "/admin"
          : session.user.role === "TEACHER"
            ? "/t/dashboard"
            : "/dashboard";

      window.location.assign(session.user.mustChangePassword ? "/change-password" : destination);
    } catch {
      setError("登录请求失败，请检查网络后重试");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="w-full max-w-md animate-fade-up">
      <CardContent className="space-y-6 p-8">
        <div className="space-y-1.5 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary-subtle text-primary">
            <Lock className="h-5 w-5" />
          </div>
          <h1 className="mt-3 text-xl font-semibold">登录 PyLearn</h1>
          <p className="text-sm text-muted-foreground">教师与学生账号由管理员统一创建</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="hidden" name="role" value={selectedRole} />
          <div className="space-y-1.5">
            <Label>登录角色</Label>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="登录角色">
              {[
                { value: "STUDENT" as const, label: "学生", icon: GraduationCap },
                { value: "TEACHER" as const, label: "教师", icon: Presentation },
                { value: "ADMIN" as const, label: "管理员", icon: ShieldCheck },
              ].map((item) => {
                const active = selectedRole === item.value;
                const Icon = item.icon;
                return (
                  <button
                    key={item.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setSelectedRole(item.value)}
                    className={`relative flex h-10 items-center justify-center gap-1.5 rounded-md border text-xs font-medium transition-colors ${
                      active
                        ? "border-primary bg-primary-subtle text-primary"
                        : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                    {active && <Check className="absolute right-1.5 top-1.5 h-3 w-3" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="identifier">邮箱 / 学号 / 工号</Label>
            <Input
              id="identifier"
              name="identifier"
              placeholder="zhang.san@school.edu 或 20240101"
              required
              autoComplete="username"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">密码</Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPwd ? "text" : "password"}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                aria-label={showPwd ? "隐藏密码" : "显示密码"}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-subtle-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-danger/30 bg-danger-subtle/40 px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}
          {errorParam === "CredentialsSignin" && (
            <div className="rounded-lg border border-danger/30 bg-danger-subtle/40 px-3 py-2 text-xs text-danger">
              账号或密码错误
            </div>
          )}
          {errorParam === "forbidden" && (
            <div className="rounded-lg border border-warning/30 bg-warning-subtle/40 px-3 py-2 text-xs text-warning">
              权限不足
            </div>
          )}

          <Button type="submit" className="w-full" size="lg" disabled={pending}>
            {pending ? "登录中…" : "登录"}
          </Button>
        </form>

        <div className="rounded-lg border border-warning/30 bg-warning-subtle/40 p-3 text-xs text-muted-foreground">
          <b className="text-warning">首次登录？</b> 请使用管理员下发的初始密码登录，登录后强制跳转到修改密码页。
        </div>
      </CardContent>
    </Card>
  );
}
