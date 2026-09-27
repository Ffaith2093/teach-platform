"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "./notification-bell";

interface TopbarProps {
  crumbs: { label: string; href?: string }[];
}

export function Topbar({ crumbs }: TopbarProps) {
  const pathname = usePathname() ?? "";
  // 管理员端没有通知中心，对他们隐藏铃铛
  const isAdmin = pathname.startsWith("/admin");
  // 教师端路径以 /t 开头，通知中心在 /t/notifications
  const notificationHref = pathname.startsWith("/t") ? "/t/notifications" : "/notifications";
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-border bg-background/95 px-8 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <nav aria-label="breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="text-subtle-foreground">/</span>}
            {c.href ? (
              <a href={c.href} className="transition-colors hover:text-foreground">
                {c.label}
              </a>
            ) : (
              <span className="font-medium text-foreground">{c.label}</span>
            )}
          </React.Fragment>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-1.5">
        <ThemeToggle />
        {!isAdmin && <NotificationBell href={notificationHref} />}
      </div>
    </header>
  );
}
