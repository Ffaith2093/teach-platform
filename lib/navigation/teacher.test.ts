import assert from "node:assert/strict";
import test from "node:test";
import { teacherAssignmentHref } from "./teacher";

test("course analytics links assignments to the existing teacher detail page", () => {
  assert.equal(teacherAssignmentHref("assignment-1"), "/t/assignments/assignment-1");
});
