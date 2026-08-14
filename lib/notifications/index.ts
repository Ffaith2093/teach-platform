import { prisma } from "@/lib/prisma";

/**
 * 通知工具：单发 / 群发 / 未读计数。
 * 不放 server action 标记（"use server"）—— 这层只导出纯 server 函数，
 * 调用方（actions / API routes）自己负责鉴权与并发控制。
 */
export async function notify(input: {
  userId: string;
  title: string;
  body: string;
  href?: string;
}) {
  await prisma.notification.create({
    data: {
      userId: input.userId,
      title: input.title,
      body: input.body,
      href: input.href,
    },
  });
}

export async function notifyMany(input: {
  userIds: string[];
  title: string;
  body: string;
  href?: string;
}) {
  const ids = Array.from(new Set(input.userIds)).filter(Boolean);
  if (ids.length === 0) return 0;
  const result = await prisma.notification.createMany({
    data: ids.map((userId) => ({
      userId,
      title: input.title,
      body: input.body,
      href: input.href,
    })),
  });
  return result.count;
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, isRead: false } });
}