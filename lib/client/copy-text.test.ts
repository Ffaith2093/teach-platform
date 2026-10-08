import assert from "node:assert/strict";
import test from "node:test";
import { copyText } from "./copy-text";

function replaceGlobal(name: "navigator" | "window" | "document", value: unknown) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  return () => {
    if (original) Object.defineProperty(globalThis, name, original);
    else delete (globalThis as Record<string, unknown>)[name];
  };
}

test("uses the Clipboard API in a secure context", async () => {
  let written = "";
  const restoreNavigator = replaceGlobal("navigator", { clipboard: { writeText: async (value: string) => { written = value; } } });
  const restoreWindow = replaceGlobal("window", { isSecureContext: true });
  try {
    assert.equal(await copyText("initial-password"), true);
    assert.equal(written, "initial-password");
  } finally {
    restoreWindow();
    restoreNavigator();
  }
});

test("falls back to execCommand on an HTTP IP address", async () => {
  let selected = false;
  let appended = false;
  const textarea = {
    value: "",
    style: {} as Record<string, string>,
    setAttribute() {},
    select() { selected = true; },
    setSelectionRange() {},
  };
  const restoreNavigator = replaceGlobal("navigator", { clipboard: undefined });
  const restoreWindow = replaceGlobal("window", { isSecureContext: false });
  const restoreDocument = replaceGlobal("document", {
    createElement: () => textarea,
    execCommand: (command: string) => command === "copy",
    body: {
      appendChild() { appended = true; },
      removeChild() { appended = false; },
    },
  });
  try {
    assert.equal(await copyText("abc123"), true);
    assert.equal(textarea.value, "abc123");
    assert.equal(selected, true);
    assert.equal(appended, false);
  } finally {
    restoreDocument();
    restoreWindow();
    restoreNavigator();
  }
});
