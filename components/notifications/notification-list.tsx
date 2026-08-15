"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Inbox, Megaphone, Settings2 } from "lucide-react";
import { relativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  href: string | null;
  isRead: boolean;
  createdAt: string;
  courseId: string | null;
  courseTitle: string | null;
};

export type NotificationGroup = {
  /** "system" = courseId=null; 其他 = 课程 id */
  key: string;
  label: string;
  items: NotificationItem[];
};

type Filter = "all" | "unread" | "course";

export function NotificationList({ groups }: { groups: NotificationGroup[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [filter, setFilter] = React.useState<Filter>("all");

  const totalUnread = React.useMemo(
    () => groups.reduce((s, g) => s + g.items.filter((i) => !i.isRead).length, 0),
    [groups],
  );

  const filteredGroups = React.useMemo(() => {
    const applyFilter = (items: NotificationItem[]) =>
      filter === "unread" ? items.filter((i) => !i.isRead) : items;
    return groups
      .map((g) => {
        // 「课程公告」筛选：只保留课程组（key !== "system"）
        if (filter === "course" && g.key === "system") return { ...g, items: [] };
        return { ...g, items: applyFilter(g.items) };
      })
      .filter((g) => g.items.length > 0);
  }, [groups, filter]);

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

  async function markGroup(courseKey: string) {
    // 课程组：按 courseId 批量已读；系统组：所有 courseId=null 的
    if (courseKey === "system") {
      // 复用 read-all（不动已读通知），这里改用后端批量
      await fetch("/api/notifications/read-all", { method: "POST" });
    } else {
      await fetch(`/api/notifications/course/${courseKey}/read`, { method: "POST" });
    }
    router.refresh();
  }

  if (groups.every((g) => g.items.length === 0)) {
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
    <div className="space-y-4">
      {/* 筛选条 */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2.5">
        <div className="flex items-center gap-1.5 text-sm">
          <FilterPill active={filter === "all"} onClick={() => setFilter("all")}>
            全部
          </FilterPill>
          <FilterPill active={filter === "unread"} onClick={() => setFilter("unread")}>
            未读
            {totalUnread > 0 && (
              <Badge variant="warning" className="ml-1.5 num">
                {totalUnread}
              </Badge>
            )}
          </FilterPill>
          <FilterPill active={filter === "course"} onClick={() => setFilter("course")}>
            课程公告
          </FilterPill>
        </div>
        {totalUnread > 0 && (
          <Button variant="ghost" size="sm" onClick={markAll} disabled={busy}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            全部标为已读
          </Button>
        )}
      </div>

      {/* 空筛选态 */}
      {filteredGroups.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {filter === "unread"
                ? "没有未读通知 🎉"
                : filter === "course"
                  ? "暂无课程公告"
                  : "暂无通知"}
            </p>
          </CardContent>
        </Card>
      )}

      {/* 分组列表 */}
      {filteredGroups.map((g) => {
        const groupUnread = g.items.filter((i) => !i.isRead).length;
        const isSystem = g.key === "system";
        return (
          <Card key={g.key}>
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b border-border px-6 py-3">
                <div className="flex items-center gap-2">
                  {isSystem ? (
                    <Settings2 className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Megaphone className="h-4 w-4 text-primary" />
                  )}
                  <span className="text-sm font-medium">{g.label}</span>
                  <span className="text-[11px] text-subtle-foreground num">
                    {g.items.length} 条
                  </span>
                  {groupUnread > 0 && (
                    <Badge variant="warning" className="num">
                      {groupUnread} 未读
                    </Badge>
                  )}
                </div>
                {groupUnread > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => markGroup(g.key)}
                    className="text-xs"
                  >
                    本组已读
                  </Button>
                )}
              </div>
              <ul className="divide-y divide-border">
                {g.items.map((n) => {
                  const Inner = (
                    <>
                      <div
                        className={cn(
                          "mt-1 flex h-2 w-2 shrink-0 rounded-full",
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
                        <p className="mt-1.5 text-[11px] text-subtle-foreground num">
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
      })}
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}