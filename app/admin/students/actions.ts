"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guard";
import {
  parseImportFile,
  parseGradeImportFile,
  validateImport,
  initialPassword,
  type ImportRow,
  type GradeImportRow,
} from "@/lib/students/import";

// ========== 年级 ==========

const gradeSchema = z.object({
  name: z.string().min(1, "年级名不能为空"),
  joinYear: z.coerce.number().int().min(2000).max(2100),
});

export type ActionState = { error?: string; ok?: boolean };

export async function createGradeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole(["ADMIN"]);
  const parsed = gradeSchema.safeParse({
    name: formData.get("name"),
    joinYear: formData.get("joinYear"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "输入有误" };
  try {
    await prisma.grade.create({ data: parsed.data });
    revalidatePath("/admin/students");
    return { ok: true };
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { error: "年级名已存在" };
    throw e;
  }
}

export async function setGradeActiveAction(gradeId: string, isActive: boolean) {
  await requireRole(["ADMIN"]);
  await prisma.grade.update({
    where: { id: gradeId },
    data: { isActive },
  });
  revalidatePath("/admin/students");
}

// ========== 班级 ==========

const classSchema = z.object({
  gradeId: z.string().min(1),
  name: z.string().min(1, "班级名不能为空"),
  joinYear: z.coerce.number().int().min(2000).max(2100),
});

export async function createClassAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole(["ADMIN"]);
  const parsed = classSchema.safeParse({
    gradeId: formData.get("gradeId"),
    name: formData.get("name"),
    joinYear: formData.get("joinYear"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "输入有误" };
  try {
    const cls = await prisma.class.create({ data: parsed.data });
    revalidatePath(`/admin/students/${parsed.data.gradeId}`);
    redirect(`/admin/students/${parsed.data.gradeId}/${cls.id}`);
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { error: "该年级下已存在同名班级" };
    throw e;
  }
}

export async function deleteClassAction(gradeId: string, classId: string) {
  await requireRole(["ADMIN"]);
  const studentCount = await prisma.user.count({ where: { classId } });
  if (studentCount > 0) {
    throw new Error(`班级内仍有 ${studentCount} 名学生，请先转出或删除`);
  }
  // 删除前清空 ClassTeacher 占用（释放班级）
  await prisma.classTeacher.deleteMany({ where: { classId } });
  await prisma.class.delete({ where: { id: classId } });
  revalidatePath(`/admin/students/${gradeId}`);
}

// ========== 学生 ==========

const studentSchema = z.object({
  classId: z.string().min(1),
  name: z.string().min(1, "姓名不能为空"),
  studentNo: z.string().regex(/^\d{8}$/, "学号必须为 8 位数字"),
  email: z.string().email().optional().or(z.literal("")),
});

export async function createStudentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole(["ADMIN"]);
  const parsed = studentSchema.safeParse({
    classId: formData.get("classId"),
    name: formData.get("name"),
    studentNo: formData.get("studentNo"),
    email: formData.get("email") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "输入有误" };
  const { classId, name, studentNo, email } = parsed.data;
  const pwd = initialPassword(studentNo);
  try {
    await prisma.user.create({
      data: {
        email: email || `${studentNo}@school.edu`,
        passwordHash: await bcrypt.hash(pwd, 12),
        name,
        studentNo,
        classId,
        role: "STUDENT",
        status: "ACTIVE",
        mustChangePassword: true,
      },
    });
    const cls = await prisma.class.findUnique({ where: { id: classId } });
    if (cls) revalidatePath(`/admin/students/${cls.gradeId}/${classId}`);
    return { ok: true };
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { error: "学号或邮箱已被占用" };
    throw e;
  }
}

export async function deleteStudentAction(gradeId: string, classId: string, studentId: string) {
  await requireRole(["ADMIN"]);
  await prisma.user.delete({ where: { id: studentId } });
  revalidatePath(`/admin/students/${gradeId}/${classId}`);
}

export async function resetStudentPasswordAction(
  gradeId: string,
  classId: string,
  studentId: string,
) {
  await requireRole(["ADMIN"]);
  const u = await prisma.user.findUnique({ where: { id: studentId }, select: { studentNo: true } });
  if (!u?.studentNo) throw new Error("学生不存在");
  const pwd = initialPassword(u.studentNo);
  await prisma.user.update({
    where: { id: studentId },
    data: {
      passwordHash: await bcrypt.hash(pwd, 12),
      mustChangePassword: true,
    },
  });
  revalidatePath(`/admin/students/${gradeId}/${classId}`);
  return pwd; // 返回给调用方显示
}

// ========== 转班 ==========

// 转出策略：
// - fromClassId：把该班全部学生转到 toClassId
// - studentIds：精确转指定学生（保留以备后续扩展）
const transferSchema = z
  .object({
    studentIds: z.array(z.string()).optional(),
    fromClassId: z.string().optional(),
    toClassId: z.string().min(1),
  })
  .refine((v) => v.studentIds?.length || v.fromClassId, {
    message: "必须指定 fromClassId 或 studentIds",
  });

export async function transferStudentsAction(input: z.input<typeof transferSchema>) {
  await requireRole(["ADMIN"]);
  const parsed = transferSchema.parse(input);

  const where = parsed.studentIds?.length
    ? { id: { in: parsed.studentIds } }
    : { classId: parsed.fromClassId! };

  // 先查要被转的学生 IDs（updateMany 不返回行）
  const targetStudents = await prisma.user.findMany({
    where,
    select: { id: true },
  });
  const targetIds = targetStudents.map((s) => s.id);

  const result = await prisma.user.updateMany({
    where: { id: { in: targetIds } },
    data: { classId: parsed.toClassId },
  });

  // 给每个被转学生发通知（指明新班级）
  if (targetIds.length > 0) {
    const toClass = await prisma.class.findUnique({
      where: { id: parsed.toClassId },
      select: { name: true, grade: { select: { name: true } } },
    });
    if (toClass) {
      const { notifyMany } = await import("@/lib/notifications");
      await notifyMany({
        userIds: targetIds,
        title: "班级调整通知",
        body: `您已转入 ${toClass.grade.name} · ${toClass.name}`,
        href: "/my-class",
      });
    }
  }

  revalidatePath("/admin/students");
  revalidatePath("/notifications");
  return result.count;
}

// ========== 批量导入 ==========

export type ImportState =
  | { stage: "idle" }
  | {
      stage: "preview";
      total: number;
      sample: ImportRow[];
      errors: { rowNo: number; raw: string; reason: string }[];
      fileBase64?: string;
    }
  | { stage: "done"; created: number }
  | { stage: "error"; message: string };

/**
 * 阶段 1：上传 + 解析 + 校验 → 返回预览 / 错误清单
 * 表单字段：file, classId
 * 校验后返回 fileBase64，confirm 时回传
 */
export async function previewImportAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  await requireRole(["ADMIN"]);
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { stage: "error", message: "请选择文件" };
  if (file.size > 5 * 1024 * 1024) return { stage: "error", message: "文件大小不能超过 5MB" };
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!["csv", "xlsx"].includes(ext ?? "")) {
    return { stage: "error", message: "仅支持 .csv / .xlsx 文件" };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let rows: ImportRow[];
  try {
    rows = await parseImportFile(buffer);
  } catch (e) {
    return { stage: "error", message: (e as Error).message };
  }
  if (rows.length === 0) return { stage: "error", message: "文件没有有效数据行" };

  // 查重
  const studentNos = rows.map((r) => r.studentNo).filter(Boolean);
  const emails = rows.map((r) => r.email).filter((e): e is string => !!e);
  const [existingByNo, existingByEmail] = await Promise.all([
    prisma.user.findMany({
      where: { studentNo: { in: studentNos } },
      select: { studentNo: true },
    }),
    prisma.user.findMany({
      where: { email: { in: emails } },
      select: { email: true },
    }),
  ]);

  const { okRows, errors } = validateImport(rows, {
    studentNos: new Set(existingByNo.map((u) => u.studentNo!).filter(Boolean)),
    emails: new Set(existingByEmail.map((u) => u.email!).filter(Boolean)),
  });

  // 把 buffer 编码后回传，避免 confirm 时要求用户重新上传
  const fileBase64 = buffer.toString("base64");

  if (errors.length > 0) {
    return {
      stage: "preview",
      total: rows.length,
      sample: okRows.slice(0, 5),
      errors,
      fileBase64,
    };
  }
  return {
    stage: "preview",
    total: rows.length,
    sample: okRows.slice(0, 5),
    errors: [],
    fileBase64,
  };
}

/**
 * 阶段 2：确认导入
 * 表单字段：classId, fileBase64
 */
export async function confirmImportAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  await requireRole(["ADMIN"]);
  const classId = String(formData.get("classId") ?? "");
  const fileBase64 = String(formData.get("fileBase64") ?? "");
  if (!classId || !fileBase64) return { stage: "error", message: "缺少必要参数" };

  const buffer = Buffer.from(fileBase64, "base64");
  let rows: ImportRow[];
  try {
    rows = await parseImportFile(buffer);
  } catch (e) {
    return { stage: "error", message: (e as Error).message };
  }

  // 再校验一次（防御）
  const studentNos = rows.map((r) => r.studentNo).filter(Boolean);
  const emails = rows.map((r) => r.email).filter((e): e is string => !!e);
  const [existingByNo, existingByEmail] = await Promise.all([
    prisma.user.findMany({ where: { studentNo: { in: studentNos } }, select: { studentNo: true } }),
    prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true } }),
  ]);
  const { okRows, errors } = validateImport(rows, {
    studentNos: new Set(existingByNo.map((u) => u.studentNo!).filter(Boolean)),
    emails: new Set(existingByEmail.map((u) => u.email!).filter(Boolean)),
  });
  if (errors.length > 0) {
    return { stage: "preview", total: rows.length, sample: okRows.slice(0, 5), errors };
  }

  // bcrypt 计算放在数据库事务外，避免大批量导入超过 Prisma 事务时限。
  const users = await Promise.all(
    okRows.map(async (r) => ({
      email: r.email || `${r.studentNo}@school.edu`,
      passwordHash: await bcrypt.hash(initialPassword(r.studentNo), 12),
      name: r.name,
      studentNo: r.studentNo,
      classId,
      role: "STUDENT" as const,
      status: "ACTIVE" as const,
      mustChangePassword: true,
    })),
  );
  try {
    await prisma.user.createMany({ data: users });
  } catch (error) {
    return { stage: "error", message: `导入失败：${(error as Error).message}` };
  }

  const cls = await prisma.class.findUnique({ where: { id: classId } });
  if (cls) revalidatePath(`/admin/students/${cls.gradeId}/${classId}`);

  return { stage: "done", created: users.length };
}

export type GradeImportState =
  | { stage: "idle" }
  | {
      stage: "preview";
      total: number;
      sample: GradeImportRow[];
      errors: { rowNo: number; raw: string; reason: string }[];
      fileBase64?: string;
    }
  | { stage: "done"; created: number }
  | { stage: "error"; message: string };

async function validateGradeRows(gradeId: string, rows: GradeImportRow[]) {
  const classes = await prisma.class.findMany({
    where: { gradeId },
    select: { id: true, name: true },
  });
  const classByName = new Map(classes.map((item) => [item.name.trim(), item.id]));
  const studentNos = rows.map((row) => row.studentNo).filter(Boolean);
  const emails = rows.map((row) => row.email).filter((email): email is string => !!email);
  const [existingByNo, existingByEmail] = await Promise.all([
    prisma.user.findMany({ where: { studentNo: { in: studentNos } }, select: { studentNo: true } }),
    prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true } }),
  ]);
  const validated = validateImport(rows, {
    studentNos: new Set(existingByNo.map((user) => user.studentNo!).filter(Boolean)),
    emails: new Set(existingByEmail.map((user) => user.email!).filter(Boolean)),
  });
  const classErrors = rows
    .filter((row) => !row.className || !classByName.has(row.className.trim()))
    .map((row) => ({
      rowNo: row.rowNo,
      raw: row.raw,
      reason: row.className ? `班级「${row.className}」不存在于当前年级` : "班级名为空",
    }));
  const errors = [...validated.errors, ...classErrors].sort((a, b) => a.rowNo - b.rowNo);
  const errorRows = new Set(errors.map((error) => error.rowNo));
  return { okRows: rows.filter((row) => !errorRows.has(row.rowNo)), errors, classByName };
}

export async function previewGradeImportAction(
  _prev: GradeImportState,
  formData: FormData,
): Promise<GradeImportState> {
  await requireRole(["ADMIN"]);
  const gradeId = String(formData.get("gradeId") ?? "");
  const file = formData.get("file") as File | null;
  if (!gradeId) return { stage: "error", message: "缺少年级参数" };
  if (!file || file.size === 0) return { stage: "error", message: "请选择文件" };
  if (file.size > 5 * 1024 * 1024) return { stage: "error", message: "文件大小不能超过 5MB" };
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!["csv", "xlsx"].includes(ext ?? "")) return { stage: "error", message: "仅支持 .csv / .xlsx 文件" };

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const rows = await parseGradeImportFile(buffer);
    const { okRows, errors } = await validateGradeRows(gradeId, rows);
    return {
      stage: "preview",
      total: rows.length,
      sample: okRows.slice(0, 5),
      errors,
      fileBase64: buffer.toString("base64"),
    };
  } catch (error) {
    return { stage: "error", message: (error as Error).message };
  }
}

export async function confirmGradeImportAction(
  _prev: GradeImportState,
  formData: FormData,
): Promise<GradeImportState> {
  await requireRole(["ADMIN"]);
  const gradeId = String(formData.get("gradeId") ?? "");
  const fileBase64 = String(formData.get("fileBase64") ?? "");
  if (!gradeId || !fileBase64) return { stage: "error", message: "缺少必要参数" };
  try {
    const rows = await parseGradeImportFile(Buffer.from(fileBase64, "base64"));
    const { okRows, errors, classByName } = await validateGradeRows(gradeId, rows);
    if (errors.length > 0) return { stage: "preview", total: rows.length, sample: okRows.slice(0, 5), errors };
    const users = await Promise.all(
      okRows.map(async (row) => ({
        email: row.email || `${row.studentNo}@school.edu`,
        passwordHash: await bcrypt.hash(initialPassword(row.studentNo), 12),
        name: row.name,
        studentNo: row.studentNo,
        classId: classByName.get(row.className.trim())!,
        role: "STUDENT" as const,
        status: "ACTIVE" as const,
        mustChangePassword: true,
      })),
    );
    await prisma.user.createMany({ data: users });
    revalidatePath(`/admin/students/${gradeId}`);
    for (const classId of new Set(users.map((user) => user.classId))) {
      revalidatePath(`/admin/students/${gradeId}/${classId}`);
    }
    return { stage: "done", created: users.length };
  } catch (error) {
    return { stage: "error", message: `导入失败：${(error as Error).message}` };
  }
}
