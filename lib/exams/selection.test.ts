import assert from "node:assert/strict";
import test from "node:test";
import { normalizeExamQuestionSelections } from "./selection";

test("normalizes multiple unique exam question selections", () => {
  assert.deepEqual(
    normalizeExamQuestionSelections([
      { kind: "LIBRARY", id: "q-1", score: 5 },
      { kind: "LIBRARY", id: "q-1", score: 5 },
      { kind: "PROGRAMMING", id: "p-1", score: 20 },
    ]),
    [
      { kind: "LIBRARY", id: "q-1", score: 5 },
      { kind: "PROGRAMMING", id: "p-1", score: 20 },
    ],
  );
});

test("rejects invalid batch scores and empty ids", () => {
  assert.throws(
    () => normalizeExamQuestionSelections([{ kind: "LIBRARY", id: "", score: 0 }]),
    /题目|分值/,
  );
});
