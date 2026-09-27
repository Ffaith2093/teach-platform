import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDrawPool, drawQuestionIds, drawTotalScore } from "./rules";
import { effectiveQuestionScore, finalExamScore, scaledProblemScore } from "./scoring";
import { shuffleOptions } from "./shuffle";

test("overlapping broad and narrow draw rules reserve distinct questions", () => {
  const pool = buildDrawPool([
    { id: "a", type: "SINGLE_CHOICE", difficulty: "EASY", tags: [] },
    { id: "b", type: "SINGLE_CHOICE", difficulty: "HARD", tags: [] },
  ], { bankId: "bank", rules: [
    { type: "SINGLE_CHOICE", count: 1, scorePerQuestion: 2 },
    { type: "SINGLE_CHOICE", difficulty: "EASY", count: 1, scorePerQuestion: 3 },
  ] });
  assert.deepEqual(pool.rules.map((r) => r.questionIds), [["b"], ["a"]]);
  assert.deepEqual(drawQuestionIds(pool, () => 0), ["b", "a"]);
  assert.equal(drawTotalScore(pool), 5);
});

test("draw rejects an impossible overlap", () => {
  assert.throws(() => buildDrawPool([
    { id: "a", type: "FILL_BLANK", difficulty: "EASY", tags: [] },
  ], { bankId: "bank", rules: [
    { type: "FILL_BLANK", count: 1, scorePerQuestion: 2 },
    { type: "FILL_BLANK", count: 1, scorePerQuestion: 2 },
  ] }), /不足|冲突/);
});

test("options retain their answer keys and order across reloads", () => {
  const options = ["A", "B", "C", "D"];
  assert.deepEqual(shuffleOptions(options, "attempt:q"), shuffleOptions(options, "attempt:q"));
  assert.deepEqual([...shuffleOptions(options, "attempt:q")].sort(), options);
});

test("manual grade replaces automatic grade and allocation scales", () => {
  assert.equal(effectiveQuestionScore({ autoScore: 8, manualScore: 5 }), 5);
  assert.equal(finalExamScore([{ autoScore: 8, manualScore: 5 }, { autoScore: 7, manualScore: null }], 10), 10);
  assert.equal(scaledProblemScore(70, 100, 20), 14);
  assert.equal(scaledProblemScore(110, 100, 20), 20);
});
