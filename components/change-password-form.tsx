"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldAlert, Check, X } from "lucide-react";
import {
  changePasswordAction,
  type ChangePasswordState,
} from "@/app/(public)/login/actions";
import { cn } from "@/lib/utils";

const initial: ChangePasswordState = {};

function calcChecks(pwd: string) {
  return {
    len: pwd.length >= 8,
    letter: /[a-zA-Z]/.test(pwd),
    digit: /\d/.test(pwd),
    pwd: pwd.length > 0,
  };
}

export function ChangePasswordForm({ initialNew }: { initialNew?: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(changePasswordAction, initial);
  const [pwd, setPwd] = React.useState(initialNew ?? "");

  React.useEffect(() => {
    if (state.ok) {
      const dest =
        typeof window !== "undefined" && window.location.pathname === "/change-password"
          ? "/dashboard"
          : "/dashboard";
      // 改密后强制重新登录更安全，但此处保持已登录状态跳转
      router.push(dest);
      router.refresh();
    }
  }, [state, router]);

  const checks = calcChecks(pwd);
  const strength = [checks.len, checks.letter, checks.digit].filter(Boolean).length;

  return (
    <Card className="w-full max-w-md animate-fade-up">
      <CardContent className="space-y-6 p-8">
        <div className="space-y-1.5 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-warning-subtle text-warning">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <h1 className="mt-3 text-xl font-semibold">请修改初始密码</h1>
          <p className="text-sm text-muted-foreground">首次登录需修改密码后才能进入系统</p>
        </div>
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="oldPassword">当前密码</Label>
            <Input id="oldPassword" name="oldPassword" type="password" required autoComplete="current-password" />
            {state?.fieldErrors?.oldPassword && (
              <p className="text-xs text-danger">{state.fieldErrors.oldPassword}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="newPassword">新密码</Label>
            <Input
              id="newPassword"
              name="newPassword"
              type="password"
              required
              autoComplete="new-password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
            />
            {pwd && (
              <div className="mt-2 grid grid-cols-4 gap-1">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className={cn(
                      "h-1 rounded-full transition-colors",
                      strength >= n
                        ? strength <= 1
                          ? "bg-danger"
                          : strength === 2
                            ? "bg-warning"
                            : "bg-success"
                        : "bg-muted",
                    )}
                  />
                ))}
              </div>
            )}
            <ul className="mt-2 space-y-1 text-xs">
              {[
                { ok: checks.len, label: "至少 8 位" },
                { ok: checks.letter, label: "包含字母" },
                { ok: checks.digit, label: "包含数字" },
              ].map((c) => (
                <li
                  key={c.label}
                  className={cn(
                    "flex items-center gap-1.5 transition-colors",
                    c.ok ? "text-success" : "text-subtle-foreground",
                  )}
                >
                  {c.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                  {c.label}
                </li>
              ))}
            </ul>
            {state?.fieldErrors?.newPassword && (
              <p className="text-xs text-danger">{state.fieldErrors.newPassword}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">确认新密码</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              autoComplete="new-password"
            />
            {state?.fieldErrors?.confirmPassword && (
              <p className="text-xs text-danger">{state.fieldErrors.confirmPassword}</p>
            )}
          </div>

          {state?.error && (
            <div className="rounded-lg border border-danger/30 bg-danger-subtle/40 px-3 py-2 text-xs text-danger">
              {state.error}
            </div>
          )}

          <Button type="submit" className="w-full" size="lg" disabled={pending || !checks.len || !checks.letter || !checks.digit}>
            {pending ? "提交中…" : "提交并进入系统"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
