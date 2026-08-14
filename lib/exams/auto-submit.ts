/**
 * 自动交卷兜底（SPEC §3.2）
 *
 * 扫描 status=IN_PROGRESS 且 deadlineAt < now 的 attempt，调用 submitExam 强制提交。
 * 调用方（route handler / BullMQ repeat job / 系统 cron）负责鉴权与节流。
 *
 * 设计：单次最多处理 50 条，单条串行（每条最多 ~30s 评测时间，避免 cron 任务超时）。
 * 上限超出时分多次调用，靠调用方节流（默认每分钟一次）。
 */
import { prisma } from "@/lib/prisma";
import { submitExam } from "./submit";

export type AutoSubmitSummary = {
  scanned: number;
  processed: number;
  skipped: number;
  errors: number;
  attempts: string[];
  durationMs: number;
};

const BATCH_SIZE = 50;

export async function autoSubmitExpiredAttempts(): Promise<AutoSubmitSummary> {
  const start = Date.now();
  const now = new Date();

  const candidates = await prisma.examAttempt.findMany({
    where: {
      status: "IN_PROGRESS",
      deadlineAt: { lt: now },
    },
    select: { id: true },
    orderBy: { deadlineAt: "asc" },
    take: BATCH_SIZE,
  });

  const attempts: string[] = [];
  let skipped = 0;
  let errors = 0;

  for (const c of candidates) {
    try {
      const r = await submitExam(c.id);
      if (r.ok) {
        if (r.isAutoSubmit) {
          attempts.push(c.id);
        } else {
          // submitExam 返回 ok 但 isAutoSubmit=false：说明 deadline 还没到（窗口期内被学生 / 别的 cron 抢先提交），跳过
          skipped++;
        }
      } else {
        errors++;
      }
    } catch (e) {
      // 单条失败不影响后续
      console.error(`[auto-submit] failed for ${c.id}:`, e);
      errors++;
    }
  }

  return {
    scanned: candidates.length,
    processed: attempts.length,
    skipped,
    errors,
    attempts,
    durationMs: Date.now() - start,
  };
}