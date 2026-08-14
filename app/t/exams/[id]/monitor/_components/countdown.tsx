"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

function format(ms: number) {
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  const s = Math.floor((abs % 60_000) / 1000);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * 通用倒计时：每秒刷新，剩余时间用红色高亮（< 5 分钟），超时显示灰色 + 「已超时」。
 * 大块用于整场考试倒计时；小条用于学生剩余时间。
 */
export function Countdown({
  deadline,
  variant = "small",
  label,
}: {
  deadline: string;
  variant?: "small" | "big";
  label?: string;
}) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const ms = new Date(deadline).getTime() - now;
  const over = ms <= 0;
  const danger = !over && ms < 5 * 60_000;

  if (variant === "big") {
    return (
      <div className="flex items-baseline gap-3">
        {label && <span className="text-xs text-muted-foreground">{label}</span>}
        <span
          className={cn(
            "num font-mono text-3xl font-bold tracking-tight",
            over ? "text-muted-foreground" : danger ? "text-danger" : "text-foreground",
          )}
        >
          {over ? `+${format(ms)}` : format(ms)}
        </span>
        <span className="text-xs text-muted-foreground">
          {over ? "已结束" : danger ? "即将结束" : "剩余"}
        </span>
      </div>
    );
  }

  return (
    <span
      className={cn(
        "num font-mono text-xs",
        over ? "text-muted-foreground" : danger ? "text-danger font-medium" : "text-muted-foreground",
      )}
      title={label}
    >
      {over ? `+${format(ms)}` : format(ms)}
    </span>
  );
}