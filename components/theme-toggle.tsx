"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // resolvedTheme 反映实际渲染的 theme（dark/light），不受 enableSystem 影响
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="主题切换"
      // 始终挂上 onClick：避免 mounted=false 窗口期内点击被吞；
      // 此时无论 isDark 是 true 还是 false，setTheme("dark" 或 "light") 都会把状态往确定方向推
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {/* 图标仅在 mounted 后切换，避免 SSR/CSR 不一致导致的 hydration warning */}
      {mounted && isDark ? <Sun /> : <Moon />}
    </Button>
  );
}