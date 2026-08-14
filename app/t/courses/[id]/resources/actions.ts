"use server";

/**
 * 课程资源管理 Server Actions
 *
 * - 创建虚拟目录（其实只是把 folder 字符串落到下个上传里；目录本身不占空间）
 * - 删除资源：删磁盘文件 + 改 DB
 */
import { unlink } from "node:fs/promises";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/guard";
import { resolveStoredPath, validateFolder, StorageError } from "@/lib/storage";

async function requireCourseTeacher(courseId: string) {
  const session = await requireSession();
  if (session.user.role !== "TEACHER" && session.user.role !== "ADMIN") {
    throw new Error("仅教师可执行此操作");
  }
  if (session.user.role === "TEACHER") {
    const m = await prisma.courseTeacher.findUnique({
      where: { courseId_teacherId: { courseId, teacherId: session.user.id } },
    });
    if (!m) throw new Error("您不在该课程团队中");
  }
  return session;
}

const createFolderSchema = z.object({
  courseId: z.string().min(1),
  folder: z.string().min(1, "请输入目录名").max(80),
  parent: z.string().default("/"),
});

export type CreateFolderState = {
  error?: string;
  ok?: boolean;
  folder?: string;
};

export async function createFolderAction(
  _prev: CreateFolderState | undefined,
  formData: FormData,
): Promise<CreateFolderState> {
  const parsed = createFolderSchema.safeParse({
    courseId: formData.get("courseId"),
    folder: formData.get("folder"),
    parent: formData.get("parent") || "/",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "请检查输入" };
  }

  try {
    await requireCourseTeacher(parsed.data.courseId);
  } catch (e) {
    return { error: (e as Error).message };
  }

  let parent: string;
  try {
    parent = validateFolder(parsed.data.parent);
  } catch (e) {
    if (e instanceof StorageError) return { error: e.message };
    throw e;
  }
  const folderName = parsed.data.folder.replace(/^\/+|\/+$/g, "").trim();
  if (!folderName) return { error: "目录名不能为空" };

  const fullPath = parent === "/" ? `/${folderName}` : `${parent}/${folderName}`;
  // 不真正创建磁盘目录（懒创建于下次上传）；校验：通过 validateFolder 防穿越
  try {
    validateFolder(fullPath);
  } catch (e) {
    if (e instanceof StorageError) return { error: e.message };
    throw e;
  }

  revalidatePath(`/t/courses/${parsed.data.courseId}/resources`);
  return { ok: true, folder: fullPath };
}

export type DeleteResourceState = {
  error?: string;
  ok?: boolean;
};

/** 删除资源（DB + 磁盘）。教师不限制 OWNER 角色——任何 CourseTeacher 都能删自己上传的或他人上传的 */
export async function deleteResourceAction(
  resourceId: string,
): Promise<DeleteResourceState> {
  const resource = await prisma.resource.findUnique({
    where: { id: resourceId },
    select: { id: true, courseId: true, storedName: true },
  });
  if (!resource) return { error: "资源不存在" };

  try {
    await requireCourseTeacher(resource.courseId);
  } catch (e) {
    return { error: (e as Error).message };
  }

  // 先删 DB（不删成功就不删磁盘），再删磁盘（失败只警告）
  await prisma.resource.delete({ where: { id: resourceId } });

  try {
    const absolutePath = resolveStoredPath(resource.courseId, resource.storedName);
    await unlink(absolutePath);
  } catch {
    // 文件可能已丢失，不影响 DB 一致
    console.warn(`[deleteResourceAction] unlink failed for resource=${resourceId}`);
  }

  revalidatePath(`/t/courses/${resource.courseId}/resources`);
  return { ok: true };
}
