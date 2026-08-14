"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, CheckCircle2, Inbox } from "lucide-react";
import { relativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  title: string;
  body: string;
  href: string | null;
  isRead: boolean;
  createdAt: string;
};

export function NotificationList({ items }: { items: Item[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function markOne(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
    router.refresh();
  }

  async function markAll() {
    setBusy(true);
    try {
      await fetch(`/api/notifications/read-all`, { method: "POST" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const unreadCount = items.filter((i) => !i.isRead).length;

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Inbox className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">暂无通知</p>
            <p className="mt-1 text-xs text-muted-foreground">教师发布的公告会显示在这里</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between border-b border-border px-6 py-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              全部通知
            </span>
            {unreadCount > 0 && (
              <Badge variant="warning">
                <span className="num">{unreadCount}</span> 条未读
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAll} disabled={busy}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              全部标为已读
            </Button>
          )}
        </div>
        <ul className="divide-y divide-border">
          {items.map((n) => {
            const Inner = (
              <>
                <div
                  className={cn(
                    "mt-0.5 flex h-2 w-2 shrink-0 rounded-full",
                    n.isRead ? "bg-transparent" : "bg-primary",
                  )}
                  aria-label={n.isRead ? "已读" : "未读"}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-sm font-medium">{n.title}</div>
                    {!n.isRead && (
                      <Badge variant="warning" className="text-[10px]">
                        未读
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {n.body}
                  </p>
                  <p className="mt-1.5 text-[11px] text-subtle-foreground">
                    {relativeTime(n.createdAt)}
                  </p>
                </div>
              </>
            );
            const handleClick = () => !n.isRead && markOne(n.id);
            return (
              <li key={n.id}>
                {n.href ? (
                  <Link
                    href={n.href}
                    onClick={handleClick}
                    className={cn(
                      "flex items-start gap-4 px-6 py-4 transition-colors hover:bg-muted/40",
                      !n.isRead && "bg-primary-subtle/20",
                    )}
                  >
                    {Inner}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={handleClick}
                    className={cn(
                      "flex w-full items-start gap-4 px-6 py-4 text-left transition-colors hover:bg-muted/40",
                      !n.isRead && "bg-primary-subtle/20",
                    )}
                  >
                    {Inner}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}