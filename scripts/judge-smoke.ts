import assert from "node:assert/strict";
import { runSandbox, runSandboxWithInput } from "@/lib/judge/sandbox";

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
  const samples = await runSandbox(
    "value = int(input()); print(value * value)",
    [
      { input: "2\n", expected: "4\n", isSample: true, score: 5 },
      { input: "3\n", expected: "9\n", isSample: true, score: 5 },
    ],
    { timeLimitMs: 1000, memoryLimitMb: 128 },
  );
  assert.equal(samples.status, "ACCEPTED", JSON.stringify(samples));
  assert.equal(samples.passedCount, 2);
  assert.equal(samples.totalCount, 2);
  console.log("SAMPLES: 2/2 ACCEPTED");
  await check("WA", "print(0)", "WRONG_ANSWER");
  await check("TLE", "while True: pass", "TLE", 500);
  await check("MLE", "chunks = []\nwhile True: chunks.append(bytearray(1024 * 1024))", "MLE");
  const custom = await runSandboxWithInput(
    "a, b = map(int, input().split()); print(a * b)",
    "6 7\n",
    { timeLimitMs: 1000, memoryLimitMb: 128 },
  );
  assert.equal(custom.status, "ACCEPTED");
  assert.equal(custom.actualOutput?.trim(), "42");
  console.log("CUSTOM: ACCEPTED");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
