import assert from "node:assert/strict";
import test from "node:test";
import { hashInitialPasswords } from "./passwords";

test("hashes 1000 initial passwords without blocking the web event loop", async () => {
  const studentNos = Array.from({ length: 1000 }, (_, index) => String(10_000_000 + index));
  let heartbeatCount = 0;
  const heartbeat = setInterval(() => {
    heartbeatCount += 1;
  }, 10);

  try {
    const hashes = await hashInitialPasswords(studentNos, { rounds: 4, workers: 2 });

    assert.equal(hashes.length, studentNos.length);
    assert.ok(hashes.every((hash) => hash.startsWith("$2")));
    assert.ok(heartbeatCount >= 5, `event loop heartbeat only ran ${heartbeatCount} times`);
  } finally {
    clearInterval(heartbeat);
  }
});
