import { Worker } from "node:worker_threads";
import { initialPassword } from "./import";

interface HashInitialPasswordsOptions {
  rounds?: number;
  workers?: number;
}

interface WorkerResult {
  hashes: Array<[number, string]>;
}

const WORKER_SOURCE = String.raw`
  const { parentPort, workerData } = require("node:worker_threads");
  const bcrypt = require("bcryptjs");

  async function main() {
    const hashes = [];
    for (const [index, password] of workerData.entries) {
      hashes.push([index, await bcrypt.hash(password, workerData.rounds)]);
    }
    parentPort.postMessage({ hashes });
    parentPort.close();
  }

  main().catch((error) => {
    setImmediate(() => { throw error; });
  });
`;

export async function hashInitialPasswords(
  studentNos: string[],
  options: HashInitialPasswordsOptions = {},
): Promise<string[]> {
  if (studentNos.length === 0) return [];

  const rounds = Math.min(31, Math.max(4, options.rounds ?? 12));
  // One worker is deliberate in production: it keeps the Next.js event loop and
  // the other CPU core available while a large import is hashing passwords.
  const workerCount = Math.min(studentNos.length, Math.max(1, Math.min(4, options.workers ?? 1)));
  const chunks: Array<Array<[number, string]>> = Array.from({ length: workerCount }, () => []);

  studentNos.forEach((studentNo, index) => {
    chunks[index % workerCount]!.push([index, initialPassword(studentNo)]);
  });

  const results = await Promise.all(
    chunks.map(
      (entries) =>
        new Promise<WorkerResult>((resolve, reject) => {
          const worker = new Worker(WORKER_SOURCE, {
            eval: true,
            workerData: { entries, rounds },
          });
          let settled = false;

          worker.once("message", (result: WorkerResult) => {
            settled = true;
            resolve(result);
          });
          worker.once("error", reject);
          worker.once("exit", (code) => {
            if (!settled && code !== 0) reject(new Error(`密码哈希线程异常退出（${code}）`));
          });
        }),
    ),
  );

  const hashes = new Array<string>(studentNos.length);
  for (const result of results) {
    for (const [index, hash] of result.hashes) hashes[index] = hash;
  }
  if (hashes.some((hash) => !hash)) throw new Error("部分初始密码生成失败");
  return hashes;
}
