/**
 * Docker 沙箱评测（生产）
 *
 * SPEC §3.1 安全红线：
 *   --network=none --memory --memory-swap --cpus --pids-limit=64
 *   --read-only --tmpfs /tmp:size=16m
 *   --cap-drop=ALL --security-opt=no-new-privileges
 *   -u 65534:65534 (nobody)
 *
 * 每个测试用例独立容器：
 *   mkdtemp → 写入 main.py + input.txt → docker run → wait → logs → remove
 *
 * 返回结构与 lib/judge/local.ts 一致，调用方零修改。
 */
import Docker from "dockerode";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  JudgeRunResult,
  JudgeCaseInput,
  JudgeLimits,
  JudgeCaseResult,
  JudgeStatus,
} from "./local";

/** 宽松比对：忽略行尾空白 + 末尾空行 */
function looseEqual(actual: string, expected: string): boolean {
  const norm = (s: string) =>
    s
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((l) => l.replace(/\s+$/, ""))
      .join("\n")
      .replace(/\n+$/, "\n")
      .replace(/^\n+/, "");
  return norm(actual) === norm(expected);
}

/** Docker logs 是 8 字节 header + payload 的多路复用流 */
function parseDockerLogs(buf: Buffer): { stdout: string; stderr: string } {
  let stdout = "";
  let stderr = "";
  let i = 0;
  while (i < buf.length) {
    if (i + 8 > buf.length) break;
    const streamType = buf[i]; // 1 = stdout, 2 = stderr
    const size = buf.readUInt32BE(i + 4);
    if (size <= 0 || i + 8 + size > buf.length) break;
    const payload = buf.slice(i + 8, i + 8 + size).toString("utf8");
    if (streamType === 1) stdout += payload;
    else if (streamType === 2) stderr += payload;
    i += 8 + size;
  }
  return { stdout, stderr };
}

const docker = new Docker();

const DEFAULT_IMAGE = process.env.JUDGE_IMAGE ?? "python:3.11-slim";

export async function runSandbox(
  code: string,
  testCases: JudgeCaseInput[],
  limits: JudgeLimits,
): Promise<JudgeRunResult> {
  const stageDir = await mkdtemp(join(tmpdir(), "judge-"));
  const createdContainers: import("dockerode").Container[] = [];
  const cleanup = async () => {
    await Promise.all(
      createdContainers.map((c) => c.remove({ force: true }).catch(() => {})),
    );
    await rm(stageDir, { recursive: true, force: true }).catch(() => {});
  };

  try {
    await writeFile(join(stageDir, "main.py"), code, "utf8");

    const cases: JudgeCaseResult[] = [];
    for (const tc of testCases) {
      const caseScore = tc.score ?? 0;
      const r = await runOneCase(stageDir, tc, limits, createdContainers);
      // 输出比对（local.ts 的逻辑）
      if (r.status === "ACCEPTED") {
        const ok = looseEqual(r.actualOutput ?? "", tc.expected);
        cases.push({
          ...r,
          status: ok ? "ACCEPTED" : "WRONG_ANSWER",
          score: ok ? caseScore : 0,
        });
      } else {
        cases.push(r);
      }
    }

    const firstFail = cases.find((c) => c.status !== "ACCEPTED");
    const passed = cases.filter((c) => c.status === "ACCEPTED").length;
    const totalScore = cases.reduce((s, c) => s + c.score, 0);
    return {
      status: firstFail ? firstFail.status : "ACCEPTED",
      passedCount: passed,
      totalCount: cases.length,
      totalScore,
      cases,
    };
  } catch (e) {
    return {
      status: "SYSTEM_ERROR",
      passedCount: 0,
      totalCount: testCases.length,
      totalScore: 0,
      cases: testCases.map(() => ({
        status: "SYSTEM_ERROR" as JudgeStatus,
        timeMs: 0,
        score: 0,
        errorMsg: (e as Error).message,
      })),
    };
  } finally {
    await cleanup();
  }
}

async function runOneCase(
  stageDir: string,
  tc: JudgeCaseInput,
  limits: JudgeLimits,
  containers: import("dockerode").Container[],
): Promise<JudgeCaseResult> {
  const startedAt = Date.now();
  const caseScore = tc.score ?? 0;
  const timeoutSec = Math.max(1, Math.ceil(limits.timeLimitMs / 1000) + 1);

  // 写 input.txt（容器启动前必须就位）
  await writeFile(join(stageDir, "input.txt"), tc.input, "utf8");

  const container = await docker.createContainer({
    Image: DEFAULT_IMAGE,
    User: "65534:65534",
    Cmd: [
      "timeout",
      "-s",
      "KILL",
      String(timeoutSec),
      "sh",
      "-c",
      "python /code/main.py < /code/input.txt",
    ],
    HostConfig: {
      NetworkMode: "none",
      Memory: limits.memoryLimitMb * 1024 * 1024,
      MemorySwap: limits.memoryLimitMb * 1024 * 1024,
      Cpus: 0.5,
      PidsLimit: 64,
      ReadonlyRootfs: true,
      Tmpfs: { "/tmp": "size=16m" },
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges"],
      // 仅挂载临时目录（CLAUDE.md 红线）
      Binds: [`${stageDir}:/code`],
      AutoRemove: false,
    },
  });
  containers.push(container);

  try {
    await container.start();
  } catch (e) {
    return {
      status: "SYSTEM_ERROR",
      timeMs: Date.now() - startedAt,
      score: 0,
      errorMsg: `容器启动失败: ${(e as Error).message}`,
    };
  }

  // 等待退出（同时设 timer，超出限制就 kill）
  const killTimer = setTimeout(async () => {
    try {
      await container.kill({ signal: "SIGKILL" });
    } catch {
      /* ignore */
    }
  }, limits.timeLimitMs + 1500);

  let exitCode: number;
  try {
    const w = await container.wait();
    exitCode = w.StatusCode;
  } catch (e) {
    return {
      status: "SYSTEM_ERROR",
      timeMs: Date.now() - startedAt,
      score: 0,
      errorMsg: `容器等待失败: ${(e as Error).message}`,
    };
  } finally {
    clearTimeout(killTimer);
  }

  const timeMs = Date.now() - startedAt;

  // 读 stdout + stderr
  let stdout = "";
  let stderr = "";
  try {
    const logsBuf = (await container.logs({
      stdout: true,
      stderr: true,
      follow: false,
    })) as unknown as Buffer;
    const parsed = parseDockerLogs(logsBuf);
    stdout = parsed.stdout;
    stderr = parsed.stderr;
  } catch {
    /* 读不到就当空 */
  }

  // 状态判定（与 local.ts 一致）
  if (exitCode === 137 || (exitCode !== 0 && timeMs >= limits.timeLimitMs)) {
    return { status: "TLE", timeMs, score: 0, errorMsg: "执行超时" };
  }
  if (
    stderr.includes("SyntaxError") ||
    stderr.includes("IndentationError") ||
    stderr.includes("TabError")
  ) {
    return {
      status: "COMPILE_ERROR",
      timeMs,
      score: 0,
      errorMsg: stderr.slice(0, 2000),
    };
  }
  if (stderr.includes("MemoryError") || stderr.includes("OOM")) {
    return { status: "MLE", timeMs, score: 0, errorMsg: "内存超限" };
  }
  if (exitCode !== 0) {
    return {
      status: "RUNTIME_ERROR",
      timeMs,
      score: 0,
      errorMsg: stderr.slice(0, 2000) || `exit code ${exitCode}`,
    };
  }

  return {
    status: "ACCEPTED",
    timeMs,
    score: caseScore,
    actualOutput: stdout,
  };
}
