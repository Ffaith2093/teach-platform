"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";

export function ChartCard({
  title,
  subtitle,
  height = 240,
  empty,
  children,
}: {
  title: string;
  subtitle?: string;
  height?: number;
  empty?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle && (
            <span className="text-xs text-muted-foreground">{subtitle}</span>
          )}
        </div>
        {empty ? (
          <div
            className="flex items-center justify-center rounded-md border border-dashed border-border bg-muted/20 text-xs text-muted-foreground"
            style={{ height }}
          >
            暂无数据
          </div>
        ) : (
          <div style={{ width: "100%", height }}>{children}</div>
        )}
      </CardContent>
    </Card>
  );
}