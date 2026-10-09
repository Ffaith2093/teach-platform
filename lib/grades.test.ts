import assert from "node:assert/strict";
import test from "node:test";
import { compareClassNames, formatGradeLabel } from "./grades";

test("does not repeat a join year already present in the grade name", () => {
  assert.equal(formatGradeLabel("2026 级", 2026), "2026 级");
});

test("keeps the join year for semantic grade names", () => {
  assert.equal(formatGradeLabel("高一年级", 2024), "高一年级 · 2024级");
});

test("sorts class names by their numeric value", () => {
  const names = ["11班", "2班", "12班", "1班", "高一(3)班"];
  assert.deepEqual(names.sort(compareClassNames), ["1班", "2班", "高一(3)班", "11班", "12班"]);
});
