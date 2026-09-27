import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { parseImportFile, validateImport } from "./import";

test("parses CSV rows, quoted fields, blank rows, and leading-zero student numbers", async () => {
  const csv = Buffer.from(
    '姓名,学号,邮箱\r\n"张,三",01234567,zhang@example.com\r\n,,\r\n李四,20240102,\r\n',
  );

  assert.deepEqual(await parseImportFile(csv), [
    {
      rowNo: 2,
      name: "张,三",
      studentNo: "01234567",
      email: "zhang@example.com",
      raw: "张,三 | 01234567 | zhang@example.com",
    },
    {
      rowNo: 4,
      name: "李四",
      studentNo: "20240102",
      email: undefined,
      raw: "李四 | 20240102",
    },
  ]);
});

test("parses the first XLSX worksheet", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("学生");
  sheet.addRow(["姓名", "学号", "邮箱"]);
  sheet.addRow(["王五", "20240103", "wang@example.com"]);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

  assert.deepEqual(await parseImportFile(buffer), [
    {
      rowNo: 2,
      name: "王五",
      studentNo: "20240103",
      email: "wang@example.com",
      raw: "王五 | 20240103 | wang@example.com",
    },
  ]);
});

test("rejects empty and header-only files", async () => {
  await assert.rejects(parseImportFile(Buffer.alloc(0)), /文件为空或无法解析/);
  await assert.rejects(parseImportFile(Buffer.from("姓名,学号,邮箱\n")), /至少需要 1 行数据/);
});

test("reports validation errors without accepting the invalid rows", () => {
  const rows = [
    { rowNo: 2, name: "张三", studentNo: "20240101", raw: "张三 | 20240101" },
    { rowNo: 3, name: "李四", studentNo: "20240101", raw: "李四 | 20240101" },
    {
      rowNo: 4,
      name: "王五",
      studentNo: "20240103",
      email: "bad-email",
      raw: "王五 | 20240103 | bad-email",
    },
  ];

  const result = validateImport(rows, { studentNos: new Set(), emails: new Set() });

  assert.deepEqual(
    result.okRows.map((row) => row.rowNo),
    [2],
  );
  assert.deepEqual(
    result.errors.map((error) => error.reason),
    ["学号 20240101 在文件中重复", "邮箱格式不合法：bad-email"],
  );
});
