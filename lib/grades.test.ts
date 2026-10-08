import assert from "node:assert/strict";
import test from "node:test";
import { formatGradeLabel } from "./grades";

test("does not repeat a join year already present in the grade name", () => {
  assert.equal(formatGradeLabel("2026 级", 2026), "2026 级");
});

test("keeps the join year for semantic grade names", () => {
  assert.equal(formatGradeLabel("高一年级", 2024), "高一年级 · 2024级");
});
