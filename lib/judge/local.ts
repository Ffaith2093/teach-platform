/**
 * 本地 Python 评测（开发环境用，dev-only）
 *
 * ⚠️ 没有沙箱隔离！生产必须换成 SPEC §3.1 的 BullMQ + Docker 方案：
 *   --network=none --read-only --cap-drop=ALL --pids-limit=64
 *
 * 本文件只负责「评测接口 + 行为契约」一致，方便上层 UI 无需改。
 * 真实部署时把 runJudge 换成 BullMQ push + worker pull，调用方不变。
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type JudgeStatus =
  | "ACCEPTED"
  | "WRONG_ANSWER"
  | "TLE"
  | "MLE"
  | "RUNTIME_ERROR"
  | "COMPILE_ERROR"
  | "SYSTEM_ERROR";

export interface JudgeCaseInput {
  input: string;
  expected: string;
}

export interface JudgeLimits {
  timeLimitMs: number;
  memoryLimitMb: number;
}

export interface JudgeCaseResult {
  status: JudgeStatus;
  timeMs: number;
  memoryKb?: number;
  actualOutput?: string;
  errorMsg?: string;
}

export interface JudgeRunResult {
  status: JudgeStatus; // 整体：取第一个非 ACCEPTED
  passedCount: number;
  totalCount: number;
  cases: JudgeCaseResult[];
}

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

/** 单次执行单用例（带超时） */
function runOneCase(
  mainPy: string,
  input: string,
  timeLimitMs: number,
): Promise<JudgeCaseResult> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn("python3", ["-I", "-B", "-W", "ignore", mainPy], {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: timeLimitMs + 500, // 略放宽，给退出时间
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => (stdout += b.toString()));
    child.stderr.on("data", (b) => (stderr += b.toString()));

    const killTimer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeLimitMs + 200);

    child.on("close", (code, signal) => {
      clearTimeout(killTimer);
      const timeMs = Date.now() - startedAt;

      // 1. 超时（SIGKILL 是我们或 Node timeout 触发的）
      if (signal === "SIGKILL" && timeMs >= timeLimitMs) {
        return resolve({ status: "TLE", timeMs, errorMsg: "执行超时" });
      }

      // 2. 语法错误
      if (
        stderr.includes("SyntaxError") ||
        stderr.includes("IndentationError") ||
        stderr.includes("TabError")
      ) {
        return resolve({
          status: "COMPILE_ERROR",
          timeMs,
          errorMsg: stderr.slice(0, 2000),
        });
      }

      // 3. OOM（粗略：stderr 里有 MemoryError）
      if (stderr.includes("MemoryError")) {
        return resolve({ status: "MLE", timeMs, errorMsg: "内存超限" });
      }

      // 4. 非零退出码 → RUNTIME_ERROR
      if (code !== 0) {
        return resolve({
          status: "RUNTIME_ERROR",
          timeMs,
          errorMsg: stderr.slice(0, 2000) || `exit code ${code}`,
        });
      }

      // 5. 退出码 0，输出比对交给调用方（已知 expected）
      resolve({ status: "ACCEPTED", timeMs, actualOutput: stdout });
    });

    child.on("error", (err) => {
      clearTimeout(killTimer);
      resolve({
        status: "SYSTEM_ERROR",
        timeMs: Date.now() - startedAt,
        errorMsg: err.message,
      });
    });

    // 写入 stdin 并关闭
    child.stdin.write(input);
    child.stdin.end();
  });
}

/**
 * 跑全部用例。返回每用例详细结果 + 整体状态。
 */
export async function runJudge(
  code: string,
  testCases: JudgeCaseInput[],
  limits: JudgeLimits,
): Promise<JudgeRunResult> {
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), "judge-"));
    const mainPy = join(dir, "main.py");
    await writeFile(mainPy, code, "utf8");

    const cases: JudgeCaseResult[] = [];
    for (const tc of testCases) {
      const r = await runOneCase(mainPy, tc.input, limits.timeLimitMs);
      // 输出比对
      if (r.status === "ACCEPTED") {
        const ok = looseEqual(r.actualOutput ?? "", tc.expected);
        cases.push({
          ...r,
          status: ok ? "ACCEPTED" : "WRONG_ANSWER",
        });
      } else {
        cases.push(r);
      }
    }

    // 整体状态：第一个非 ACCEPTED
    const firstFail = cases.find((c) => c.status !== "ACCEPTED");
    const passed = cases.filter((c) => c.status === "ACCEPTED").length;

    return {
      status: firstFail ? firstFail.status : "ACCEPTED",
      passedCount: passed,
      totalCount: cases.length,
      cases,
    };
  } catch (e) {
    return {
      status: "SYSTEM_ERROR",
      passedCount: 0,
      totalCount: testCases.length,
      cases: testCases.map(() => ({
        status: "SYSTEM_ERROR" as const,
        timeMs: 0,
        errorMsg: (e as Error).message,
      })),
    };
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}