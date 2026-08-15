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

export type StudentTrendPoint = {
  /** ISO 日期（Y 轴 / 显示用） */
  x: string;
  /** 标签：作业名 / 试卷名 */
  label: string;
  /** 课程名（hover 显示） */
  course: string;
  /** 作业分（百分比 0-100），无则为 null */
  assignmentPct: number | null;
  /** 考试分（百分比 0-100），无则为 null */
  examPct: number | null;
};

export function GradeTrendChart({ data }: { data: StudentTrendPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center text-sm text-muted-foreground">
        暂无成绩数据，开始作业 / 考试后会在此显示趋势
      </div>
    );
  }

  // recharts 数据格式：直接传 data points；缺值字段为 null 时线断在该点
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
            dataKey="assignmentPct"
            name="作业"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={{ r: 3, fill: "hsl(var(--primary))" }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="examPct"
            name="考试"
            stroke="hsl(var(--accent))"
            strokeWidth={2}
            dot={{ r: 3, fill: "hsl(var(--accent))" }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}