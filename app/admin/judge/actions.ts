"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { addJudgeJob } from "@/lib/judge/queue";

export type RejudgeState = {
  error?: string;
  ok?: boolean;
};

/**
 * 手动重跑一个评测失败/卡住的提交。
 * - 仅管理员可调用
 * - 把 Submission.status 重置为 PENDING，清掉 errorMsg
 * - 重新入队（addJudgeJob 自带 attempts:2 + 指数退避）
 */
export async function rejudgeSubmissionAction(
  submissionId: string,
): Promise<RejudgeState> {
  const session = await requireSession();
  if (session.user.role !== "ADMIN") {
    return { error: "仅管理员可手动重跑" };
  }

  const sub = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { id: true, status: true },
  });
  if (!sub) return { error: "提交不存在" };

  await prisma.submission.update({
    where: { id: submissionId },
    data: { status: "PENDING", errorMsg: null },
  });

  try {
    await addJudgeJob(submissionId);
  } catch (e) {
    // 入队失败时把状态回滚（不完美，但至少不让 DB 与队列长时间不一致）
    await prisma.submission.update({
      where: { id: submissionId },
      data: { status: "SYSTEM_ERROR", errorMsg: `重跑入队失败：${(e as Error).message}` },
    });
    return { error: `入队失败：${(e as Error).message}` };
  }

  revalidatePath("/admin/judge");
  return { ok: true };
}