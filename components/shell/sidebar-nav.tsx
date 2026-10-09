"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  GraduationCap,
  LayoutDashboard,
  Users,
  BookOpen,
  FileText,
  Code,
  Library,
  ClipboardCheck,
  ListChecks,
  Server,
  BarChart3,
  UserCog,
  LogOut,
  Boxes,
  Bell,
  CircleHelp,
  SquarePen,
  History,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/app/(public)/login/actions";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  count?: number;
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

const studentNav: NavSection[] = [
  { items: [{ href: "/dashboard", label: "工作台", icon: LayoutDashboard }] },
  {
    label: "学习",
    items: [
      { href: "/courses", label: "我的课程", icon: BookOpen },
      { href: "/my-class", label: "我的班级", icon: Users },
    ],
  },
  {
    label: "考核",
    items: [
      { href: "/assignments", label: "作业", icon: FileText },
      { href: "/exams", label: "考试", icon: GraduationCap },
      { href: "/surveys", label: "问卷", icon: ClipboardList },
      { href: "/grades", label: "成绩单", icon: ListChecks },
    ],
  },
  {
    label: "消息",
    items: [
      { href: "/notifications", label: "通知中心", icon: Bell },
      { href: "/updates", label: "版本更新", icon: History },
    ],
  },
];

const teacherNav: NavSection[] = [
  {
    label: "教学",
    items: [
      { href: "/t/dashboard", label: "工作台", icon: LayoutDashboard },
      { href: "/t/classes", label: "我的班级", icon: Users },
      { href: "/t/courses", label: "课程", icon: BookOpen },
    ],
  },
  {
    label: "题库",
    items: [
      { href: "/t/banks/choice", label: "选择题", icon: CircleHelp },
      { href: "/t/banks/fill", label: "填空题", icon: SquarePen },
      { href: "/t/banks/programming", label: "编程题", icon: Code },
    ],
  },
  {
    label: "考核",
    items: [
      { href: "/t/assignments", label: "作业", icon: FileText },
      { href: "/t/exams", label: "试卷", icon: Library },
      { href: "/t/surveys", label: "问卷", icon: ClipboardList },
      { href: "/t/grading", label: "批改", icon: ClipboardCheck },
    ],
  },
  {
    label: "分析",
    items: [
      { href: "/t/monitoring", label: "考试监控", icon: Server },
      { href: "/t/analytics", label: "成绩分析", icon: BarChart3 },
    ],
  },
  {
    label: "消息",
    items: [
      { href: "/t/notifications", label: "通知中心", icon: Bell },
      { href: "/t/updates", label: "版本更新", icon: History },
    ],
  },
];

const adminNav: NavSection[] = [
  { items: [{ href: "/admin", label: "工作台", icon: LayoutDashboard }] },
  {
    label: "组织",
    items: [
      { href: "/admin/students", label: "学生管理", icon: Users },
      { href: "/admin/teachers", label: "教师管理", icon: UserCog },
      { href: "/admin/courses", label: "课程管理", icon: BookOpen },
    ],
  },
  {
    label: "评测",
    items: [{ href: "/admin/judge", label: "评测队列", icon: Server }],
  },
  {
    label: "系统",
    items: [{ href: "/admin/updates", label: "版本更新", icon: History }],
  },
];

interface SidebarShellProps {
  role: "ADMIN" | "TEACHER" | "STUDENT";
  user: { name: string; subtitle: string; initial: string };
  unreadNotifications?: number;
}

export function SidebarShell({ role, user, unreadNotifications = 0 }: SidebarShellProps) {
  const pathname = usePathname();
  const sections = role === "ADMIN" ? adminNav : role === "TEACHER" ? teacherNav : studentNav;
  const roleLabel = role === "ADMIN" ? "管理员" : role === "TEACHER" ? "教师端" : "学生端";
  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex h-16 items-center gap-2.5 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <GraduationCap className="h-5 w-5" />
        </div>
        <span className="text-[15px] font-semibold tracking-tight">PyLearn</span>
        <span className="ml-auto rounded-full bg-accent-subtle px-2 py-0.5 text-[11px] font-medium text-accent">
          {roleLabel}
        </span>
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {sections.map((section, i) => (
          <div key={i} className="space-y-0.5">
            {section.label && (
              <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-subtle-foreground">
                {section.label}
              </p>
            )}
            {section.items.map((item) => {
              const active =
                pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));
              const Icon = item.icon;
              const isNotifications =
                item.href === "/notifications" || item.href === "/t/notifications";
              const badge = isNotifications ? unreadNotifications : 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-primary-subtle font-medium text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1">{item.label}</span>
                  {badge > 0 && (
                    <span className="num text-danger-foreground inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1.5 text-[10px] font-medium">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="m-3 flex items-center gap-2.5 rounded-xl border border-border bg-muted p-3.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-warning to-danger text-[13px] font-semibold text-white">
          {user.initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium leading-tight">{user.name}</div>
          <div className="mt-0.5 truncate text-[11px] leading-tight text-subtle-foreground">
            {user.subtitle}
          </div>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            aria-label="退出登录"
            className="rounded-md p-1.5 text-subtle-foreground transition-colors hover:bg-card hover:text-danger"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </aside>
  );
}
