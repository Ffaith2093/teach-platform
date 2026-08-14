"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guard";

// ========== 教师 ==========

const teacherSchema = z.object({
  name: z.string().min(1, "姓名不能为空"),
  teacherNo: z
    .string()
    .min(1, "工号不能为空")
    .regex(/^\d{4,12}$/, "工号必须为 4-12 位数字"),
  email: z.string().email("邮箱格式不合法"),
  phone: z.string().optional().or(z.literal("")),
  subjects: z.array(z.string()).default([]),
  initialClassIds: z.array(z.string()).default([]),
});

export type TeacherFieldKey = keyof z.infer<typeof teacherSchema>;

export type CreateTeacherState = {
  error?: string;
  fieldErrors?: Partial<Record<TeacherFieldKey, string>>;
  ok?: true;
  teacherId?: string;
  initialPassword?: string;
};

/**
 * 生成 8 位初始密码（字母 + 数字）
 * SPEC §1.2：教师初始密码由系统生成
 */
function generateInitialPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pwd = "";
  for (let i = 0; i < 8; i++) {
    pwd += chars[Math.floor(Math.random() * chars.length)];
  }
  return pwd;
}

export async function createTeacherAction(
  _prev: CreateTeacherState,
  formData: FormData,
): Promise<CreateTeacherState> {
  await requireRole(["ADMIN"]);

  // subjects: 逗号分隔字符串 → 数组
  const subjectsRaw = String(formData.get("subjects") ?? "");
  const subjects = subjectsRaw
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const initialClassIds = formData.getAll("initialClassIds").map(String).filter(Boolean);

  const parsed = teacherSchema.safeParse({
    name: formData.get("name"),
    teacherNo: formData.get("teacherNo"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    subjects,
    initialClassIds,
  });

  if (!parsed.success) {
    const fieldErrors: NonNullable<CreateTeacherState["fieldErrors"]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as TeacherFieldKey;
      if (key) fieldErrors[key] = issue.message;
    }
    return { error: "请检查输入", fieldErrors };
  }

  const initialPassword = generateInitialPassword();
  try {
    const teacherId = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: parsed.data.email,
          passwordHash: await bcrypt.hash(initialPassword, 12),
          name: parsed.data.name,
          teacherNo: parsed.data.teacherNo,
          phone: parsed.data.phone || null,
          subjects: parsed.data.subjects,
          role: "TEACHER",
          status: "ACTIVE",
          mustChangePassword: true,
        },
      });
      // 一次性分配班级（每个 classId 独占）
      for (const classId of parsed.data.initialClassIds) {
        // 直接 upsert：classId 已有 ClassTeacher 时覆盖（自动顶替）
        await tx.classTeacher.upsert({
          where: { classId },
          create: { classId, teacherId: user.id, role: "SUBJECT_TEACHER" },
          update: { teacherId: user.id },
        });
      }
      return user.id;
    });
    revalidatePath("/admin/teachers");
    revalidatePath("/admin/students"); // 班级页任课教师会更新
    return { ok: true, teacherId, initialPassword };
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      // 命中 email 或 teacherNo 唯一约束
      return { error: "邮箱或工号已被占用" };
    }
    throw e;
  }
}

export async function deleteTeacherAction(teacherId: string) {
  await requireRole(["ADMIN"]);
  // 检查是否有课程所有权（CourseTeacher.OWNER）或出题/作业等
  const [courseOwnerCount, assignmentCount, problemCount] = await Promise.all([
    prisma.courseTeacher.count({ where: { teacherId, role: "OWNER" } }),
    prisma.assignment.count({ where: { creatorId: teacherId } }),
    prisma.problem.count({ where: { authorId: teacherId } }),
  ]);
  if (courseOwnerCount > 0 || assignmentCount > 0 || problemCount > 0) {
    throw new Error(
      `该教师仍有关联数据（${courseOwnerCount} 门主课程 / ${assignmentCount} 份作业 / ${problemCount} 道编程题），无法删除。请先转让课程所有权或归档其作业。`,
    );
  }
  // 释放班级占用
  await prisma.classTeacher.deleteMany({ where: { teacherId } });
  await prisma.user.delete({ where: { id: teacherId } });
  revalidatePath("/admin/teachers");
}

export async function setTeacherActiveAction(teacherId: string, isActive: boolean) {
  await requireRole(["ADMIN"]);
  await prisma.user.update({
    where: { id: teacherId },
    data: { status: isActive ? "ACTIVE" : "DISABLED" },
  });
  revalidatePath("/admin/teachers");
}

export async function updateTeacherSubjectsAction(
  teacherId: string,
  subjects: string[],
) {
  await requireRole(["ADMIN"]);
  await prisma.user.update({
    where: { id: teacherId },
    data: { subjects },
  });
  revalidatePath(`/admin/teachers/${teacherId}`);
}

// ========== 分配班级 ==========

/**
 * 把一个班级分配给某教师（覆盖式：原教师自动被顶替）
 * SPEC §3.4：勾选 → 直接占用该班，自动替换原教师
 */
export async function assignClassAction(teacherId: string, classId: string) {
  await requireRole(["ADMIN"]);
  // 1. 看原教师 → 通知（未来 P3.2 实现 Notification，这里先占位）
  const prev = await prisma.classTeacher.findUnique({
    where: { classId },
    include: { teacher: { select: { id: true, name: true } } },
  });
  if (prev?.teacherId === teacherId) return; // 没变

  await prisma.classTeacher.upsert({
    where: { classId },
    create: { classId, teacherId, role: "SUBJECT_TEACHER" },
    update: { teacherId },
  });

  revalidatePath(`/admin/teachers/${teacherId}`);
  if (prev) revalidatePath(`/admin/teachers/${prev.teacherId}`);
  revalidatePath("/admin/students");
}

/**
 * 解除班级占用（班级回到"未分配"状态）
 */
export async function unassignClassAction(teacherId: string, classId: string) {
  await requireRole(["ADMIN"]);
  await prisma.classTeacher.deleteMany({ where: { classId, teacherId } });
  revalidatePath(`/admin/teachers/${teacherId}`);
  revalidatePath("/admin/students");
}