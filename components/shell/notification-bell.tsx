"use client";

import * as React from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Topbar 右上角通知铃铛。
 * - 客户端轮询 /api/notifications/unread-count 拿未读数
 * - 30s 间隔 + 窗口 focus 时立即 refetch
 * - 未读 > 0 时显示红点；>9 显示数字
 * - href 默认 /notifications（教师端可通过 props 覆盖）
 */
export function NotificationBell({ href }: { href: string }) {
  const [count, setCount] = React.useState<number>(0);

  const fetchCount = React.useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/unread-count", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { count?: number };
      setCount(data.count ?? 0);
    } catch {
      // 静默 — 网络问题不该打扰用户
    }
  }, []);

  React.useEffect(() => {
    fetchCount();
    const id = setInterval(fetchCount, 30_000);
    const onFocus = () => fetchCount();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchCount]);

  return (
    <Link
      href={href}
      aria-label={`通知${count > 0 ? `（${count} 条未读）` : ""}`}
      className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Bell className="h-[18px] w-[18px]" />
      {count > 0 && (
        <span
          className={cn(
            "absolute right-0.5 top-0.5 inline-flex min-w-[16px] items-center justify-center rounded-full border-2 border-background px-1 text-[10px] font-medium text-danger-foreground",
            count > 99 ? "h-[18px]" : "h-[16px]",
            "bg-danger",
          )}
        >
          <span className="num leading-none">{count > 99 ? "99+" : count}</span>
        </span>
      )}
    </Link>
  );
}