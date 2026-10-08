// SPEC §3.3 学生批量导入校验 + 解析
// 输入：xlsx/CSV 原始 buffer
// 输出：ImportPreview { total, sample, rows: [{rowNo, name, studentNo, email?, raw}], errors: [{rowNo, raw, reason}] }
// 校验规则（all-or-nothing）：
//   - 姓名 / 学号不可为空
//   - 学号必须 8 位数字
//   - 邮箱可空；非空时须合法且全校唯一
//   - 学号全校唯一
// 任一行不合规 → errors[] 非空，整体拒绝导入

import { Readable } from "node:stream";
import ExcelJS, { type Worksheet } from "exceljs";

export interface ImportRow {
  rowNo: number; // 1-based，含表头
  name: string;
  studentNo: string;
  email?: string;
  raw: string; // 原始行内容，用于错误展示
}

export interface GradeImportRow extends ImportRow {
  className: string;
}

export interface ImportError {
  rowNo: number;
  raw: string;
  reason: string;
}

export interface ImportPreview {
  total: number;
  sample: ImportRow[]; // 前 5 行
  rows: ImportRow[]; // 全部合规行（errors 为空才有意义）
  errors: ImportError[]; // 任一不合规则拒绝
}

const STUDENT_NO_RE = /^\d{8}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function parseImportFile(buffer: Buffer): Promise<ImportRow[]> {
  if (buffer.length === 0) throw new Error("文件为空或无法解析");

  const workbook = new ExcelJS.Workbook();
  let sheet: Worksheet | undefined;

  try {
    if (isZipFile(buffer)) {
      await workbook.xlsx.load(Uint8Array.from(buffer).buffer);
      sheet = workbook.worksheets[0];
    } else {
      sheet = await workbook.csv.read(Readable.from([buffer]), {
        // 学号必须按文本读取，避免带前导零的学号被转成数字。
        map: (value) => value,
      });
    }
  } catch {
    throw new Error("文件为空或无法解析");
  }

  if (!sheet || sheet.rowCount < 2) {
    throw new Error("文件至少需要 1 行数据（不含表头）");
  }

  // 跳过表头
  const rows: ImportRow[] = [];
  for (let rowNo = 2; rowNo <= sheet.rowCount; rowNo++) {
    const row = sheet.getRow(rowNo);
    const name = row.getCell(1).text.trim();
    const studentNo = row.getCell(2).text.trim();
    const email = row.getCell(3).text.trim();
    if (!name && !studentNo && !email) continue; // 跳过空行
    rows.push({
      rowNo,
      name,
      studentNo,
      email: email || undefined,
      raw: [name, studentNo, email].filter(Boolean).join(" | "),
    });
  }
  return rows;
}

export async function parseGradeImportFile(buffer: Buffer): Promise<GradeImportRow[]> {
  if (buffer.length === 0) throw new Error("文件为空或无法解析");

  const workbook = new ExcelJS.Workbook();
  let sheet: Worksheet | undefined;
  try {
    if (isZipFile(buffer)) {
      await workbook.xlsx.load(Uint8Array.from(buffer).buffer);
      sheet = workbook.worksheets[0];
    } else {
      sheet = await workbook.csv.read(Readable.from([buffer]), { map: (value) => value });
    }
  } catch {
    throw new Error("文件为空或无法解析");
  }
  if (!sheet || sheet.rowCount < 2) throw new Error("文件至少需要 1 行数据（不含表头）");

  const rows: GradeImportRow[] = [];
  for (let rowNo = 2; rowNo <= sheet.rowCount; rowNo++) {
    const row = sheet.getRow(rowNo);
    const className = row.getCell(1).text.trim();
    const name = row.getCell(2).text.trim();
    const studentNo = row.getCell(3).text.trim();
    const email = row.getCell(4).text.trim();
    if (!className && !name && !studentNo && !email) continue;
    rows.push({
      rowNo,
      className,
      name,
      studentNo,
      email: email || undefined,
      raw: [className, name, studentNo, email].filter(Boolean).join(" | "),
    });
  }
  return rows;
}

function isZipFile(buffer: Buffer): boolean {
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) return false;

  const signature = buffer.readUInt16LE(2);
  return signature === 0x0403 || signature === 0x0605 || signature === 0x0807;
}

/**
 * 校验
 * - existingStudentNos / existingEmails 由调用方预查，传 null 跳过唯一性检查（不推荐）
 */
export function validateImport(
  rows: ImportRow[],
  existing: { studentNos: Set<string>; emails: Set<string> },
): { okRows: ImportRow[]; errors: ImportError[] } {
  const errors: ImportError[] = [];
  const seenNo = new Set<string>();
  const seenEmail = new Set<string>();

  for (const r of rows) {
    if (!r.name) {
      errors.push({ rowNo: r.rowNo, raw: r.raw, reason: "姓名为空" });
      continue;
    }
    if (!r.studentNo) {
      errors.push({ rowNo: r.rowNo, raw: r.raw, reason: "学号为空" });
      continue;
    }
    if (!STUDENT_NO_RE.test(r.studentNo)) {
      errors.push({ rowNo: r.rowNo, raw: r.raw, reason: "学号必须为 8 位数字" });
      continue;
    }
    if (seenNo.has(r.studentNo)) {
      errors.push({ rowNo: r.rowNo, raw: r.raw, reason: `学号 ${r.studentNo} 在文件中重复` });
      continue;
    }
    if (existing.studentNos.has(r.studentNo)) {
      errors.push({ rowNo: r.rowNo, raw: r.raw, reason: `学号 ${r.studentNo} 已被占用` });
      continue;
    }
    seenNo.add(r.studentNo);

    if (r.email) {
      if (!EMAIL_RE.test(r.email)) {
        errors.push({ rowNo: r.rowNo, raw: r.raw, reason: `邮箱格式不合法：${r.email}` });
        continue;
      }
      if (seenEmail.has(r.email)) {
        errors.push({ rowNo: r.rowNo, raw: r.raw, reason: `邮箱 ${r.email} 在文件中重复` });
        continue;
      }
      if (existing.emails.has(r.email)) {
        errors.push({ rowNo: r.rowNo, raw: r.raw, reason: `邮箱 ${r.email} 已被占用` });
        continue;
      }
      seenEmail.add(r.email);
    }
  }

  // 过滤出未出错的行（保持顺序）
  const errorRowNos = new Set(errors.map((e) => e.rowNo));
  const okRows = rows.filter((r) => !errorRowNos.has(r.rowNo));
  return { okRows, errors };
}

/**
 * 生成初始密码 = 学号后 6 位（SPEC §3.3）
 */
export function initialPassword(studentNo: string): string {
  return studentNo.slice(-6);
}
