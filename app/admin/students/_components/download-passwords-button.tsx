"use client";

import * as React from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StudentRow {
  name: string;
  studentNo: string;
  password: string;
}

interface Props {
  className: string;
  students: StudentRow[];
}

/**
 * 客户端生成 CSV 并下载。注意：
 * - 初始密码固定为学号后 6 位；只有「未改密」的学生密码才有效
 * - 这里下载的是全体学生的初始密码（即便已改密），用于补发/核对
 */
export function DownloadPasswordsButton({ className, students }: Props) {
  function download() {
    const header = "姓名,学号,初始密码,登录标识";
    const rows = students.map(
      (s) => `${s.name},${s.studentNo},${s.password},${s.studentNo}`,
    );
    // 加 BOM 让 Excel 识别 UTF-8 中文
    const csv = "\uFEFF" + [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${className}-初始密码.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <Button type="button" variant="outline" onClick={download} disabled={students.length === 0}>
      <Download />
      下载密码 CSV
    </Button>
  );
}