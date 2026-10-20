import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("login does not depend on deployment-specific server action ids", () => {
  const source = readFileSync("components/login-form.tsx", "utf8");

  assert.match(source, /from ["']next-auth\/react["']/);
  assert.doesNotMatch(source, /useActionState|loginAction/);
  assert.match(source, /fetch\(["']\/api\/auth\/session["']/);
  assert.match(source, /window\.location\.assign\(/);
});
