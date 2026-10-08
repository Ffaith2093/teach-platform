import assert from "node:assert/strict";
import test from "node:test";
import { scoreAssignmentAnswers } from "./scoring";

const questions = [
  { questionId: "choice", score: 5, question: { type: "SINGLE_CHOICE", answer: "B" } },
  { questionId: "fill", score: 10, question: { type: "FILL_BLANK", answer: ["Python", "解释器"] } },
];

test("scores choice and fill answers while ignoring case and surrounding whitespace", () => {
  assert.equal(scoreAssignmentAnswers(questions, { choice: "b", fill: [" python ", "解释器"] }), 15);
});

test("does not award partial credit when a multi-blank answer is incomplete", () => {
  assert.equal(scoreAssignmentAnswers(questions, { choice: "A", fill: ["Python", ""] }), 0);
});

test("treats malformed answer payloads as zero", () => {
  assert.equal(scoreAssignmentAnswers(questions, null), 0);
  assert.equal(scoreAssignmentAnswers(questions, []), 0);
});
