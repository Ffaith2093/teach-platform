"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/guard";

// ========== 教师课程权限工具 ==========

async function getCourseRole(courseId: string, userId: string) {
  // ADMIN 在 admin 模块独立处理；这里只判断教师角色
  const ct = await prisma.courseTeacher.findUnique({
    where: { courseId_teacherId: { courseId, teacherId: userId } },
  });
  return ct?.role ?? null; // OWNER / ASSISTANT / CONTRIBUTOR / null
}

async function requireCourseTeacher(courseId: string, minRole: "OWNER" | "ASSISTANT" = "ASSISTANT") {
  const session = await requireSession();
  if (session.user.role !== "TEACHER") {
    throw new Error("仅教师可执行此操作");
  }
  const role = await getCourseRole(courseId, session.user.id);
  if (!role) throw new Error("您不在该课程的教师团队中");
  if (minRole === "OWNER" && role !== "OWNER") {
    throw new Error("仅 OWNER 可执行此操作");
  }
  if (minRole === "ASSISTANT" && role !== "OWNER" && role !== "ASSISTANT") {
    throw new Error("权限不足");
  }
  return { session, role };
}

// ========== 创建课程 ==========

const createCourseSchema = z.object({
  title: z.string().min(1, "课程标题不能为空").max(100),
  description: z.string().max(500).optional().or(z.literal("")),
  category: z.enum(["DATA", "ALGORITHM", "AI", "NETWORK", "INTERDISCIPLINARY"]),
  semester: z.string().min(1, "学期不能为空").max(50),
  classIds: z.array(z.string()).min(1, "至少勾选一个授课班级"),
  collaboratorIds: z.array(z.string()).default([]),
});

export type CreateCourseState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof z.infer<typeof createCourseSchema>, string>>;
  ok?: true;
  courseId?: string;
};

/**
 * 教师创建课程：
 * 1. 自己自动成为 OWNER
 * 2. 勾选的 classIds：教师必须任教这些班级（ClassTeacher.classId in classIds）
 * 3. 勾选的 collaboratorIds：添加为 ASSISTANT，必须是 ACTIVE 教师
 */
export async function createCourseAction(
  _prev: CreateCourseState,
  formData: FormData,
): Promise<CreateCourseState> {
  const session = await requireSession();
  if (session.user.role !== "TEACHER") {
    return { error: "仅教师可创建课程" };
  }
  const teacherId = session.user.id;

  const classIds = formData.getAll("classIds").map(String).filter(Boolean);
  const collaboratorIds = formData.getAll("collaboratorIds").map(String).filter(Boolean);

  const parsed = createCourseSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    category: formData.get("category"),
    semester: formData.get("semester"),
    classIds,
    collaboratorIds,
  });

  if (!parsed.success) {
    const fieldErrors: NonNullable<CreateCourseState["fieldErrors"]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.infer<typeof createCourseSchema>;
      if (key) fieldErrors[key] = issue.message;
    }
    return { error: "请检查输入", fieldErrors };
  }

  // 校验：所选班级必须由该教师任教
  const taughtClassIds = new Set(
    (
      await prisma.classTeacher.findMany({
        where: { teacherId },
        select: { classId: true },
      })
    ).map((c) => c.classId),
  );
  const notTaught = parsed.data.classIds.filter((cid) => !taughtClassIds.has(cid));
  if (notTaught.length > 0) {
    return { error: "只能选择您任教的班级" };
  }

  // 校验：协作者必须是 ACTIVE 教师且不能是自己
  if (collaboratorIds.includes(teacherId)) {
    return { error: "不能将自己添加为协作者" };
  }
  const validCollaborators = await prisma.user.findMany({
    where: { id: { in: collaboratorIds }, role: "TEACHER", status: "ACTIVE" },
    select: { id: true },
  });
  if (validCollaborators.length !== collaboratorIds.length) {
    return { error: "协作者必须是在职教师" };
  }

  try {
    const courseId = await prisma.$transaction(async (tx) => {
      const course = await tx.course.create({
        data: {
          title: parsed.data.title,
          description: parsed.data.description || null,
          category: parsed.data.category,
          semester: parsed.data.semester,
          classes: {
            create: parsed.data.classIds.map((cid) => ({ classId: cid, addedById: teacherId })),
          },
        },
      });
      // 自己是 OWNER
      await tx.courseTeacher.create({
        data: { courseId: course.id, teacherId, role: "OWNER" },
      });
      // 协作者
      for (const cid of parsed.data.collaboratorIds) {
        await tx.courseTeacher.create({
          data: { courseId: course.id, teacherId: cid, role: "ASSISTANT" },
        });
      }
      return course.id;
    });
    revalidatePath("/t/courses");
    redirect(`/t/courses/${courseId}`);
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return { error: "课程标题冲突" };
    }
    // redirect() 抛出的 NEXT_REDIRECT 不能被吞掉
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    throw e;
  }
}

// ========== 编辑课程 ==========

const updateCourseSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional().or(z.literal("")),
  category: z.enum(["DATA", "ALGORITHM", "AI", "NETWORK", "INTERDISCIPLINARY"]),
  semester: z.string().min(1).max(50),
});

export type UpdateCourseState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof z.infer<typeof updateCourseSchema>, string>>;
  ok?: boolean;
};

export async function updateCourseAction(
  courseId: string,
  _prev: UpdateCourseState,
  formData: FormData,
): Promise<UpdateCourseState> {
  await requireCourseTeacher(courseId);
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
  revalidatePath("/t/courses");
  revalidatePath(`/t/courses/${courseId}`);
  return { ok: true };
}

// ========== 班级管理 ==========

/**
 * 把班级加入课程（教师必须任教该班级）
 * 课程成员 = CourseClass（多对多）。学生通过 CourseClass → User.classId 自动加入
 */
export async function addClassToCourseAction(courseId: string, classId: string) {
  const { session } = await requireCourseTeacher(courseId);
  const teacherId = session.user.id;

  // 教师必须任教该班
  const taught = await prisma.classTeacher.findFirst({
    where: { classId, teacherId },
  });
  if (!taught) throw new Error("只能添加您任教的班级");

  // 检查重复
  const existing = await prisma.courseClass.findUnique({
    where: { courseId_classId: { courseId, classId } },
  });
  if (existing) return;

  await prisma.courseClass.create({
    data: { courseId, classId, addedById: teacherId },
  });
  revalidatePath(`/t/courses/${courseId}`);
  revalidatePath(`/t/courses/${courseId}/students`);
}

export async function removeClassFromCourseAction(courseId: string, classId: string) {
  await requireCourseTeacher(courseId, "OWNER");
  await prisma.courseClass.delete({
    where: { courseId_classId: { courseId, classId } },
  });
  revalidatePath(`/t/courses/${courseId}`);
  revalidatePath(`/t/courses/${courseId}/students`);
}

// ========== 协作者管理（OWNER 专属） ==========

export async function addCollaboratorAction(courseId: string, teacherId: string) {
  const { session } = await requireCourseTeacher(courseId, "OWNER");

  const target = await prisma.user.findUnique({
    where: { id: teacherId },
    select: { role: true, status: true },
  });
  if (!target || target.role !== "TEACHER" || target.status !== "ACTIVE") {
    throw new Error("目标教师不可用");
  }
  if (teacherId === session.user.id) {
    throw new Error("不能将自己添加为协作者");
  }

  await prisma.courseTeacher.upsert({
    where: { courseId_teacherId: { courseId, teacherId } },
    create: { courseId, teacherId, role: "ASSISTANT" },
    update: {}, // 已存在则不动
  });
  revalidatePath(`/t/courses/${courseId}`);
}

export async function removeCollaboratorAction(courseId: string, teacherId: string) {
  const { session } = await requireCourseTeacher(courseId, "OWNER");
  if (teacherId === session.user.id) {
    throw new Error("OWNER 不能移除自己，请先转让所有权");
  }
  const ct = await prisma.courseTeacher.findUnique({
    where: { courseId_teacherId: { courseId, teacherId } },
  });
  if (!ct) return;
  if (ct.role === "OWNER") throw new Error("不能移除 OWNER");

  await prisma.courseTeacher.delete({
    where: { courseId_teacherId: { courseId, teacherId } },
  });
  revalidatePath(`/t/courses/${courseId}`);
}

export async function transferOwnershipAction(courseId: string, newOwnerId: string) {
  const { session } = await requireCourseTeacher(courseId, "OWNER");
  if (newOwnerId === session.user.id) throw new Error("新 OWNER 不能是您自己");

  const target = await prisma.courseTeacher.findUnique({
    where: { courseId_teacherId: { courseId, teacherId: newOwnerId } },
  });
  if (!target) throw new Error("新 OWNER 必须先加入协作者");

  await prisma.$transaction([
    // 原 OWNER → ASSISTANT
    prisma.courseTeacher.updateMany({
      where: { courseId, role: "OWNER" },
      data: { role: "ASSISTANT" },
    }),
    // 新 OWNER
    prisma.courseTeacher.update({
      where: { courseId_teacherId: { courseId, teacherId: newOwnerId } },
      data: { role: "OWNER" },
    }),
  ]);
  revalidatePath(`/t/courses/${courseId}`);
}

// ========== 归档（OWNER 专属） ==========

export async function archiveCourseAction(courseId: string) {
  await requireCourseTeacher(courseId, "OWNER");
  await prisma.course.update({
    where: { id: courseId },
    data: { isArchived: true },
  });
  revalidatePath("/t/courses");
  revalidatePath(`/t/courses/${courseId}`);
}

export async function unarchiveCourseAction(courseId: string) {
  await requireCourseTeacher(courseId, "OWNER");
  await prisma.course.update({
    where: { id: courseId },
    data: { isArchived: false },
  });
  revalidatePath("/t/courses");
  revalidatePath(`/t/courses/${courseId}`);
}