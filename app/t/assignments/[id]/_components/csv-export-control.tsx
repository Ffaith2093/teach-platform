"use client";

import * as React from "react";
import { Download } from "lucide-react";

export function CsvExportControl({
  assignmentId,
  classes,
}: {
  assignmentId: string;
  classes: Array<{ id: string; name: string; count: number }>;
}) {
  const [classId, setClassId] = React.useState<string>("");
  const href = classId
    ? `/api/assignments/${assignmentId}/submissions.csv?classId=${encodeURIComponent(classId)}`
    : `/api/assignments/${assignmentId}/submissions.csv`;

  return (
    <div className="flex items-center gap-2">
      {classes.length > 0 && (
        <select
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
          aria-label="按班级筛选导出"
        >
          <option value="">全部班级</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}（{c.count} 人）
            </option>
          ))}
        </select>
      )}
      <a
        href={href}
        download
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
      >
        <Download className="h-3.5 w-3.5" />
        导出 CSV{classId ? "（所选班级）" : ""}
      </a>
    </div>
  );
}