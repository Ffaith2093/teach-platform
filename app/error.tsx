"use client";

import { useEffect, useState } from "react";
import { unstable_isUnrecognizedActionError } from "next/navigation";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const RELOAD_KEY = "pylearn:deployment-mismatch-reload";
const RELOAD_GUARD_MS = 30_000;

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const deploymentMismatch = unstable_isUnrecognizedActionError(error);
  const [recovering, setRecovering] = useState(deploymentMismatch);

  useEffect(() => {
    if (!deploymentMismatch) {
      setRecovering(false);
      return;
    }

    const lastReload = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (!Number.isFinite(lastReload) || Date.now() - lastReload > RELOAD_GUARD_MS) {
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      window.location.reload();
      return;
    }

    setRecovering(false);
  }, [deploymentMismatch]);

  if (recovering) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="text-center">
          <RefreshCw className="mx-auto h-6 w-6 animate-spin text-primary" />
          <p className="mt-3 text-sm text-muted-foreground">正在载入最新版本...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-danger" />
        <h1 className="mt-4 text-xl font-semibold">页面暂时无法显示</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {deploymentMismatch
            ? "页面版本已经更新，请刷新后重试。"
            : "请求未能完成，请重试或刷新页面。"}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="outline" onClick={() => window.location.reload()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新页面
          </Button>
          {!deploymentMismatch && <Button onClick={reset}>重试</Button>}
        </div>
      </div>
    </main>
  );
}
