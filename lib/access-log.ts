import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * 记录一次用户访问（无侵入打点）。
 * - 当前用于：学生打开 /courses/[id] 时记录，作为「当天到课」的依据。
 * - 失败兜底：仅 console.error，不抛错，不影响主流程。
 * - 同一页面多次刷新会产生多条记录——这是「原始访问」，去重由查询端做。
 */
export async function recordAccess(input: { userId: string; courseId?: string }) {
  try {
    const h = await headers();
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      h.get("x-real-ip") ??
      null;
    const userAgent = h.get("user-agent")?.slice(0, 200) ?? null;
    await prisma.accessLog.create({
      data: {
        userId: input.userId,
        courseId: input.courseId ?? null,
        ip,
        userAgent,
      },
    });
  } catch (e) {
    console.error("[accessLog] record failed:", e);
  }
}