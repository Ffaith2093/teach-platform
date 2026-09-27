import assert from "node:assert/strict";
import test from "node:test";
import { prepareJudgeInput } from "./input";

test("preserves stdin when whitespace splitting is disabled", () => {
  assert.equal(prepareJudgeInput("2  3\n4", false), "2  3\n4");
});

test("converts arbitrary whitespace into one token per line", () => {
  assert.equal(prepareJudgeInput("  2  3\r\n4\t5  ", true), "2\n3\n4\n5\n");
});

test("keeps whitespace-only input empty", () => {
  assert.equal(prepareJudgeInput(" \r\n\t ", true), "");
});
