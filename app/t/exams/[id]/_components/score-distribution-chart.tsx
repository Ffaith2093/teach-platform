"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { ChartCard } from "@/app/_charts/chart-card";
import { CHART_COLORS } from "@/app/_charts/colors";

export function ScoreDistributionChart({
  distribution,
  totalScore,
  submittedCount,
}: {
  distribution: number[];
  totalScore: number;
  submittedCount: number;
}) {
  const SCORE_BUCKETS = [
    "0-9", "10-19", "20-29", "30-39", "40-49",
    "50-59", "60-69", "70-79", "80-89", "90-100",
  ];
  const data = SCORE_BUCKETS.map((bucket, i) => ({
    bucket,
    count: distribution[i],
  }));

  return (
    <ChartCard
      title="分数分布"
      subtitle={`满分 ${totalScore} 分 · 共 ${submittedCount} 份`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid stroke={CHART_COLORS.border} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="bucket"
            tick={{ fill: CHART_COLORS.muted, fontSize: 12 }}
            axisLine={{ stroke: CHART_COLORS.border }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: CHART_COLORS.muted, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: CHART_COLORS.muted, fillOpacity: 0.08 }}
            contentStyle={{
              background: CHART_COLORS.card,
              border: `1px solid ${CHART_COLORS.border}`,
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value: number) => [`${value} 人`, "人数"]}
          />
          <Bar dataKey="count" radius={[6, 6, 0, 0]}>
            {data.map((entry, idx) => {
              const color =
                idx >= 6
                  ? CHART_COLORS.success
                  : idx >= 5
                    ? CHART_COLORS.primary
                    : idx >= 4
                      ? CHART_COLORS.warning
                      : CHART_COLORS.danger;
              return <Cell key={idx} fill={color} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}