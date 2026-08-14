"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { CourseCategory } from "@prisma/client";

const CATEGORIES: { value: CourseCategory | "ALL"; label: string }[] = [
  { value: "ALL", label: "全部分类" },
  { value: "DATA", label: "数据" },
  { value: "ALGORITHM", label: "算法" },
  { value: "AI", label: "人工智能" },
  { value: "NETWORK", label: "计算机网络" },
  { value: "INTERDISCIPLINARY", label: "多学科交叉" },
];

interface Props {
  category: CourseCategory | "ALL";
  showArchived: boolean;
  query: string;
}

export function CourseFilterBar({ category, showArchived, query }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = React.useState(query);

  function update(next: Record<string, string | null>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    router.push(`/admin/courses?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <select
          value={category}
          onChange={(e) => update({ category: e.target.value === "ALL" ? null : e.target.value })}
          className="h-9 rounded-lg border border-border bg-muted px-3 text-sm focus-visible:border-primary focus-visible:bg-card focus-visible:outline-none"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => update({ archived: e.target.checked ? "1" : null })}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
        />
        显示已归档
      </label>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: q.trim() || null });
        }}
        className="ml-auto flex w-full max-w-sm items-center gap-2"
      >
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="按课程标题搜索…"
            className="pl-9"
          />
        </div>
      </form>
    </div>
  );
}