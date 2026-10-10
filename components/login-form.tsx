"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Eye, EyeOff, Check, GraduationCap, Presentation, ShieldCheck } from "lucide-react";
import { loginAction, type LoginState } from "@/app/(public)/login/actions";

const initial: LoginState = {};

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, formAction, pending] = useActionState(loginAction, initial);
  const [showPwd, setShowPwd] = React.useState(false);
  const [selectedRole, setSelectedRole] = React.useState<"STUDENT" | "TEACHER" | "ADMIN">("STUDENT");
  const errorParam = searchParams.get("error");

  async function handleSuccess() {
    // 拉一次 session（middleware 已经写好了 cookie），按角色跳转
    const res = await fetch("/api/auth/session");
    const session = await res.json();
    const dest =
      session?.user?.role === "ADMIN"
        ? "/admin"
        : session?.user?.role === "TEACHER"
          ? "/t/dashboard"
          : "/dashboard";
    router.push(session?.user?.mustChangePassword ? "/change-password" : dest);
    router.refresh();
  }

  // 在成功提交后跳转
  React.useEffect(() => {
    if (state.success) void handleSuccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

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
        <form action={formAction} className="space-y-4">
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
            {state?.fieldErrors?.identifier && (
              <p className="text-xs text-danger">{state.fieldErrors.identifier}</p>
            )}
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
            {state?.fieldErrors?.password && (
              <p className="text-xs text-danger">{state.fieldErrors.password}</p>
            )}
          </div>

          {state?.error && (
            <div className="rounded-lg border border-danger/30 bg-danger-subtle/40 px-3 py-2 text-xs text-danger">
              {state.error}
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
