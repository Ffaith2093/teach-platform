"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Monaco 在浏览器里加载 worker，不能 SSR
const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((m) => m.Editor),
  {
    ssr: false,
    loading: () => (
      <div
        role="status"
        aria-label="编辑器加载中"
        className="flex h-[320px] w-full items-center justify-center rounded-lg border border-border bg-muted/30 text-xs text-muted-foreground"
      >
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        正在加载编辑器…
      </div>
    ),
  },
);

export interface CodeEditorProps {
  /** 当前代码 */
  value: string;
  /** 内容变化回调 */
  onChange: (value: string) => void;
  /** 语言，默认 python（与平台 SPEC 一致） */
  language?: string;
  /** 只读模式（教师批改场景） */
  readOnly?: boolean;
  /** 高度，默认 360px */
  height?: number | string;
  /** 最小行数（影响初始行高计算） */
  minLines?: number;
  /** 外层容器样式 */
  className?: string;
  /** 无障碍标签 */
  "aria-label"?: string;
}

/**
 * 代码编辑器（基于 Monaco / @monaco-editor/react）。
 * - 主题跟随 next-themes，light → vs，dark → vs-dark
 * - 默认最小行数 14，最大化体验适合 14-20 行学生代码
 * - tabSize=4 + insertSpaces=true 符合 Python 缩进习惯
 * - 内置：行号、语法高亮、括号匹配、自动缩进、撤销栈
 */
export function CodeEditor({
  value,
  onChange,
  language = "python",
  readOnly = false,
  height = 360,
  minLines = 14,
  className,
  ...rest
}: CodeEditorProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // mounted 前用 light 主题，避免 hydration 时主题闪烁
  const editorTheme =
    mounted && resolvedTheme === "dark" ? "vs-dark" : "vs";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border",
        className,
      )}
    >
      <MonacoEditor
        height={height}
        language={language}
        value={value}
        theme={editorTheme}
        onChange={(v) => onChange(v ?? "")}
        options={{
          readOnly,
          fontSize: 13,
          fontFamily:
            'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          tabSize: 4,
          insertSpaces: true,
          renderLineHighlight: "gutter",
          lineNumbersMinChars: 3,
          padding: { top: 12, bottom: 12 },
          smoothScrolling: true,
          automaticLayout: true,
          scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
          ...(minLines ? { minLines } : {}),
          ariaLabel: rest["aria-label"],
        }}
      />
    </div>
  );
}
