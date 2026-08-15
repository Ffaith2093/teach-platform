import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/notifications/unread-count — 当前用户未读通知数
 * 供 Topbar 红点轮询使用：浏览器每 30s + window focus 时调用。
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ count: 0 });

  const count = await prisma.notification.count({
    where: { userId: session.user.id, isRead: false },
  });
  return NextResponse.json({ count });
}