"use client";

import * as React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export type ClassTrendPoint = {
  /** X 轴：MM/DD */
  x: string;
  /** 该点的主名（最新一条作业/考试标题） */
  label: string;
  /** 课程名（hover 显示） */
  course: string;
  /** 提交率 0-100（已交人数 / 班级学生数 × 100）；无则为 null */
  submitRate: number | null;
  /** 平均得分率 0-100（finalScore / totalScore）；无则为 null */
  avgPct: number | null;
  /** 该点提交/批改总数 */
  count: number;
};

export function ClassTrendChart({ data }: { data: ClassTrendPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center text-sm text-muted-foreground">
        暂无成绩数据，开始批改作业 / 阅卷后会在此显示趋势
      </div>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="x"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            stroke="hsl(var(--border))"
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            stroke="hsl(var(--border))"
            tickFormatter={(v: number) => `${v}%`}
            width={40}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "hsl(var(--muted-foreground))" }}
            formatter={(value, name) =>
              value == null ? ["—", name] : [`${value}%`, name]
            }
          />
          <Legend
            iconType="circle"
            wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
          />
          <Line
            type="monotone"
            dataKey="submitRate"
            name="提交率"
            stroke="hsl(var(--accent))"
            strokeWidth={2}
            dot={{ r: 3, fill: "hsl(var(--accent))" }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="avgPct"
            name="平均得分率"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={{ r: 3, fill: "hsl(var(--primary))" }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
