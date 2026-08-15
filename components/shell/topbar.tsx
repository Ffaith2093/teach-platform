"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Input } from "@/components/ui/input";
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
      <div className="relative ml-auto hidden w-full max-w-sm md:block">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
        <Input placeholder="搜索…" className="pl-9" />
      </div>
      <div className="ml-auto flex items-center gap-1.5 md:ml-0">
        <ThemeToggle />
        {!isAdmin && <NotificationBell href={notificationHref} />}
      </div>
    </header>
  );
}
