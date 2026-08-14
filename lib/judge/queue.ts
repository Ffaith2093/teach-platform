/**
 * BullMQ 评测队列
 *
 * Action 端：创建 Submission(status=PENDING) → addJudgeJob(submissionId) → 立即返回
 * Worker 端：从队列取 job → 反查 Submission → 跑 sandbox → 写结果
 *
 * 队列单例懒加载，避免 Next.js dev 多次实例化连接。
 */
import { Queue, type ConnectionOptions } from "bullmq";

export const JUDGE_QUEUE_NAME = "judge";

export type JudgeJobData = { submissionId: string };

let _queue: Queue<JudgeJobData> | null = null;

function redisUrl(): string {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is not set");
  return url;
}

/** Action 端用：把一个 PENDING 提交推进队列 */
export async function addJudgeJob(submissionId: string): Promise<void> {
  const queue = getJudgeQueue();
  await queue.add("judge", { submissionId }, {
    attempts: 2, // SPEC: 二次失败标 SYSTEM_ERROR
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 1000 },
    backoff: { type: "exponential", delay: 2000 },
  });
}

/** Worker 端 + 测试用：取队列实例 */
export function getJudgeQueue(): Queue<JudgeJobData> {
  if (_queue) return _queue;
  _queue = new Queue<JudgeJobData>(JUDGE_QUEUE_NAME, {
    connection: redisConnectionOptions(),
  });
  return _queue;
}

/** 把 Redis URL 转成 BullMQ 的 ConnectionOptions */
export function redisConnectionOptions(): ConnectionOptions {
  return { url: redisUrl(), maxRetriesPerRequest: null };
}
