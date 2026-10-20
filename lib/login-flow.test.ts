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

test("authenticated users are redirected before public routes are allowed", () => {
  const source = readFileSync("auth.config.ts", "utf8");
  const loginRedirect = source.indexOf('pathname === "/login"');
  const rootRedirect = source.indexOf('pathname === "/"');
  const publicBypass = source.indexOf("if (isPublic) return true");

  assert.notEqual(loginRedirect, -1);
  assert.notEqual(rootRedirect, -1);
  assert.notEqual(publicBypass, -1);
  assert.ok(loginRedirect < publicBypass, "login redirect must run before the public-route bypass");
  assert.ok(rootRedirect < publicBypass, "root redirect must run before the public-route bypass");
});

test("the client error boundary does not depend on an unstable Next.js export", () => {
  const source = readFileSync("app/error.tsx", "utf8");

  assert.doesNotMatch(source, /unstable_isUnrecognizedActionError/);
});
