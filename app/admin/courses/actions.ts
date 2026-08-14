"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guard";

// ========== 课程 ==========

const updateCourseSchema = z.object({
  title: z.string().min(1, "课程标题不能为空").max(100),
  description: z.string().max(500).optional().or(z.literal("")),
  category: z.enum(["DATA", "ALGORITHM", "AI", "NETWORK", "INTERDISCIPLINARY"]),
  semester: z.string().min(1, "学期不能为空").max(50),
});

export type UpdateCourseState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof z.infer<typeof updateCourseSchema>, string>>;
  ok?: boolean;
};

/**
 * 管理员更新课程基本信息（标题 / 描述 / 分类 / 学期）
 * SPEC：管理员侧只读为主，但保留基本纠错能力
 */
export async function updateCourseAction(
  courseId: string,
  _prev: UpdateCourseState,
  formData: FormData,
): Promise<UpdateCourseState> {
  await requireRole(["ADMIN"]);
  const parsed = updateCourseSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    category: formData.get("category"),
    semester: formData.get("semester"),
  });
  if (!parsed.success) {
    const fieldErrors: NonNullable<UpdateCourseState["fieldErrors"]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.infer<typeof updateCourseSchema>;
      if (key) fieldErrors[key] = issue.message;
    }
    return { error: "请检查输入", fieldErrors };
  }
  await prisma.course.update({
    where: { id: courseId },
    data: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      category: parsed.data.category,
      semester: parsed.data.semester,
    },
  });
  revalidatePath("/admin/courses");
  revalidatePath(`/admin/courses/${courseId}`);
  return { ok: true };
}

/**
 * 归档课程（SPEC：管理员可归档/恢复）
 * 归档后课程不出现在教师/学生默认列表；历史数据保留
 */
export async function archiveCourseAction(courseId: string) {
  await requireRole(["ADMIN"]);
  await prisma.course.update({
    where: { id: courseId },
    data: { isArchived: true },
  });
  revalidatePath("/admin/courses");
  revalidatePath(`/admin/courses/${courseId}`);
}

export async function unarchiveCourseAction(courseId: string) {
  await requireRole(["ADMIN"]);
  await prisma.course.update({
    where: { id: courseId },
    data: { isArchived: false },
  });
  revalidatePath("/admin/courses");
  revalidatePath(`/admin/courses/${courseId}`);
}

/**
 * 转让课程所有权
 * 原 OWNER 降级为 ASSISTANT；新教师提升为 OWNER
 * SPEC §2.1 OWNER 操作：删除课程/转让课程/移除协作者
 */
export async function transferCourseOwnershipAction(courseId: string, newOwnerId: string) {
  await requireRole(["ADMIN"]);
  const newTeacher = await prisma.user.findUnique({
    where: { id: newOwnerId },
    select: { id: true, role: true, status: true },
  });
  if (!newTeacher || newTeacher.role !== "TEACHER" || newTeacher.status !== "ACTIVE") {
    throw new Error("目标教师不可用");
  }

  await prisma.$transaction(async (tx) => {
    // 检查新教师是否已在协作者列表
    const existing = await tx.courseTeacher.findUnique({
      where: { courseId_teacherId: { courseId, teacherId: newOwnerId } },
    });
    if (existing) {
      // 把当前 OWNER 降级为 ASSISTANT，新教师提升为 OWNER
      await tx.courseTeacher.updateMany({
        where: { courseId, role: "OWNER" },
        data: { role: "ASSISTANT" },
      });
      await tx.courseTeacher.update({
        where: { courseId_teacherId: { courseId, teacherId: newOwnerId } },
        data: { role: "OWNER" },
      });
    } else {
      // 新教师尚未加入课程：先把原 OWNER 降级，再插入新 OWNER
      await tx.courseTeacher.updateMany({
        where: { courseId, role: "OWNER" },
        data: { role: "ASSISTANT" },
      });
      await tx.courseTeacher.create({
        data: { courseId, teacherId: newOwnerId, role: "OWNER" },
      });
    }
  });

  revalidatePath("/admin/courses");
  revalidatePath(`/admin/courses/${courseId}`);
}

/**
 * 移除课程协作者（非 OWNER）
 */
export async function removeCourseCollaboratorAction(courseId: string, teacherId: string) {
  await requireRole(["ADMIN"]);
  const ct = await prisma.courseTeacher.findUnique({
    where: { courseId_teacherId: { courseId, teacherId } },
  });
  if (!ct) return;
  if (ct.role === "OWNER") {
    throw new Error("OWNER 不能直接移除，请先转让所有权");
  }
  await prisma.courseTeacher.delete({
    where: { courseId_teacherId: { courseId, teacherId } },
  });
  revalidatePath(`/admin/courses/${courseId}`);
}