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
  Settings,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  {
    items: [{ href: "/dashboard", label: "工作台", icon: LayoutDashboard }],
  },
  {
    label: "学习",
    items: [
      { href: "/courses", label: "我的课程", icon: BookOpen, count: 5 },
      { href: "/my-class", label: "我的班级", icon: Users },
    ],
  },
  {
    label: "考核",
    items: [
      { href: "/assignments", label: "作业", icon: FileText, count: 3 },
      { href: "/exams", label: "考试", icon: GraduationCap },
      { href: "/grades", label: "成绩单", icon: ListChecks },
    ],
  },
  {
    label: "练习",
    items: [{ href: "/problems", label: "题库练习", icon: Code }],
  },
];

const teacherNav: NavSection[] = [
  {
    label: "教学",
    items: [
      { href: "/t/dashboard", label: "工作台", icon: LayoutDashboard },
      { href: "/t/classes", label: "我的班级", icon: Users },
      { href: "/t/courses", label: "课程", icon: BookOpen, count: 5 },
    ],
  },
  {
    label: "考核",
    items: [
      { href: "/t/assignments", label: "作业", icon: FileText, count: 3 },
      { href: "/t/problems", label: "题库", icon: Code },
      { href: "/t/exams", label: "试卷", icon: Library },
      { href: "/t/grading", label: "批改", icon: ClipboardCheck, count: 24 },
    ],
  },
  {
    label: "分析",
    items: [
      { href: "/t/monitoring", label: "考试监控", icon: Server },
      { href: "/t/analytics", label: "成绩分析", icon: BarChart3 },
    ],
  },
];

const adminNav: NavSection[] = [
  {
    label: "总览",
    items: [{ href: "/admin", label: "工作台", icon: LayoutDashboard }],
  },
  {
    label: "组织",
    items: [
      { href: "/admin/students", label: "学生管理", icon: Users },
      { href: "/admin/teachers", label: "教师管理", icon: UserCog },
      { href: "/admin/courses", label: "课程管理", icon: BookOpen },
    ],
  },
  {
    label: "题库与评测",
    items: [
      { href: "/admin/banks", label: "题库", icon: Library },
      { href: "/admin/judge", label: "评测队列", icon: Server },
    ],
  },
  {
    label: "系统",
    items: [{ href: "/admin/settings", label: "设置", icon: Settings }],
  },
];

interface SidebarShellProps {
  role: "STUDENT" | "TEACHER" | "ADMIN";
  user: { name: string; subtitle: string; initial: string };
}

export function SidebarShell({ role, user }: SidebarShellProps) {
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
                  <span>{item.label}</span>
                  {item.count != null && (
                    <span className="ml-auto rounded-full bg-warning-subtle px-1.5 py-0.5 text-[10px] font-semibold text-warning">
                      {item.count}
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
      </div>
    </aside>
  );
}
