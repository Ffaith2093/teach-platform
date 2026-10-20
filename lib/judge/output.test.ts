import assert from "node:assert/strict";
import test from "node:test";
import { outputsEqual } from "./output";

test("keeps the historical line-ending and trailing-space tolerance", () => {
  assert.equal(outputsEqual("\n答案  \r\n", "答案"), true);
  assert.equal(outputsEqual("1 2", "12"), false);
});

test("can ignore spaces, tabs and line breaks", () => {
  assert.equal(outputsEqual("1  2\n3", "12\t3", { ignoreWhitespace: true }), true);
});

test("can treat Chinese and English punctuation as equivalent", () => {
  assert.equal(
    outputsEqual("你好，世界！“完成”", '你好,世界!"完成"', { ignorePunctuation: true }),
    true,
  );
  assert.equal(outputsEqual("Ａ：１。", "A:1.", { ignorePunctuation: true }), true);
});

test("can combine whitespace and punctuation rules", () => {
  assert.equal(
    outputsEqual("结果： 1，2\n3。", "结果:1, 2 3.", {
      ignoreWhitespace: true,
      ignorePunctuation: true,
    }),
    true,
  );
});
