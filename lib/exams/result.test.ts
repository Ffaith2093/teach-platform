import assert from "node:assert/strict";
import test from "node:test";
import { orderAttemptQuestions } from "./result";

test("exam review includes only the questions assigned to this attempt", () => {
  const pool = [
    { questionId: "q-3", value: 3 },
    { questionId: "q-1", value: 1 },
    { questionId: "q-2", value: 2 },
  ];
  assert.deepEqual(
    orderAttemptQuestions(pool, ["q-2", "q-1"]),
    [
      { questionId: "q-2", value: 2 },
      { questionId: "q-1", value: 1 },
    ],
  );
});
