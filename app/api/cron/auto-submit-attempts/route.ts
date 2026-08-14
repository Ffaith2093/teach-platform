/**
 * 自动交卷兜底 cron（SPEC §3.2）
 *
 * 调用方式：
 * - Vercel Cron（vercel.json 已配置 1 分钟一次）
 * - 系统 cron / k8s CronJob：curl -X POST -H "Authorization: Bearer ${CRON_SECRET}" <url>
 *
 * 鉴权：Authorization header 必须等于 `Bearer ${CRON_SECRET}`，否则 401。
 */
import { NextResponse } from "next/server";
import { autoSubmitExpiredAttempts } from "@/lib/exams/auto-submit";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 单次最多 5 分钟（Vercel hobby/pro 限制）

function checkAuth(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error("[cron] CRON_SECRET is not set");
    return false;
  }
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${expected}`;
}

async function run(req: Request) {
  if (!checkAuth(req)) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }
  const result = await autoSubmitExpiredAttempts();
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  return run(req);
}

export async function GET(req: Request) {
  // Vercel Cron 默认 GET；本地系统 cron 用 POST 也兼容
  return run(req);
}