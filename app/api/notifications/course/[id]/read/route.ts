import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/notifications/course/[id]/read — 把该课程作用域下的当前用户所有未读通知标为已读
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id: courseId } = await params;
  const result = await prisma.notification.updateMany({
    where: { userId: session.user.id, courseId, isRead: false },
    data: { isRead: true },
  });
  return NextResponse.json({ ok: true, updated: result.count });
}