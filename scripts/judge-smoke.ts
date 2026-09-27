import assert from "node:assert/strict";
import { runSandbox } from "@/lib/judge/sandbox";

async function check(name: string, code: string, expectedStatus: string, timeLimitMs = 1000) {
  const result = await runSandbox(
    code,
    [{ input: "2 3\n", expected: "5\n", isSample: true, score: 10 }],
    { timeLimitMs, memoryLimitMb: 128 },
  );
  assert.equal(result.status, expectedStatus, `${name}: ${JSON.stringify(result)}`);
  console.log(`${name}: ${result.status}`);
}

async function main() {
  await check("AC", "a, b = map(int, input().split()); print(a + b)", "ACCEPTED");
  await check("WA", "print(0)", "WRONG_ANSWER");
  await check("TLE", "while True: pass", "TLE", 500);
  await check("MLE", "chunks = []\nwhile True: chunks.append(bytearray(1024 * 1024))", "MLE");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
