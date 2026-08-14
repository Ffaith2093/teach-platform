// recharts 配色：直接引用 tailwind 主题里的 CSS 变量（不硬编码颜色）
// DESIGN §6.3: "图表用 recharts，颜色直接引用 CSS 变量，不要硬编码色值"
export const CHART_COLORS = {
  primary: "hsl(var(--primary))",
  success: "hsl(var(--success))",
  warning: "hsl(var(--warning))",
  danger: "hsl(var(--danger))",
  muted: "hsl(var(--muted-foreground))",
  border: "hsl(var(--border))",
  card: "hsl(var(--card))",
} as const;

export const SCORE_BUCKETS = [
  "0-9", "10-19", "20-29", "30-39", "40-49",
  "50-59", "60-69", "70-79", "80-89", "90-100",
] as const;