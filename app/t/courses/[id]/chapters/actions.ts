"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/guard";

async function getCourseRole(courseId: string, userId: string) {
  const ct = await prisma.courseTeacher.findUnique({
    where: { courseId_teacherId: { courseId, teacherId: userId } },
  });
  return ct?.role ?? null;
}

async function requireCourseTeacher(courseId: string, minRole: "OWNER" | "ASSISTANT" = "ASSISTANT") {
  const session = await requireSession();
  if (session.user.role !== "TEACHER") {
    throw new Error("仅教师可执行此操作");
  }
  const role = await getCourseRole(courseId, session.user.id);
  if (!role) throw new Error("您不在该课程的教师团队中");
  if (minRole === "OWNER" && role !== "OWNER") {
    throw new Error("仅主讲可执行此操作");
  }
  if (minRole === "ASSISTANT" && role !== "OWNER" && role !== "ASSISTANT") {
    throw new Error("权限不足");
  }
  return { session, role };
}

// ========== 创建章节 ==========

const createChapterSchema = z.object({
  courseId: z.string().min(1),
  title: z.string().min(1, "章节标题不能为空").max(80),
  description: z.string().max(500).optional().or(z.literal("")),
});

export type ChapterFormState = {
  error?: string;
  fieldErrors?: Partial<Record<"title" | "description", string>>;
  ok?: true;
};

export async function createChapterAction(
  _prev: ChapterFormState,
  formData: FormData,
): Promise<ChapterFormState> {
  const parsed = createChapterSchema.safeParse({
    courseId: formData.get("courseId"),
    title: formData.get("title"),
    description: formData.get("description") ?? undefined,
  });
  if (!parsed.success) {
    const fieldErrors: ChapterFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as "title" | "description";
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "请检查输入", fieldErrors };
  }
  const { courseId, title, description } = parsed.data;

  try {
    await requireCourseTeacher(courseId, "ASSISTANT");
  } catch (e) {
    return { error: (e as Error).message };
  }

  try {
    // 新章节 order = max(order) + 1
    const max = await prisma.chapter.aggregate({
      where: { courseId },
      _max: { order: true },
    });
    const order = (max._max.order ?? 0) + 1;
    await prisma.chapter.create({
      data: {
        courseId,
        title,
        description: description || null,
        order,
      },
    });
  } catch (e) {
    return { error: "创建失败：" + (e as Error).message };
  }

  revalidatePath(`/t/courses/${courseId}`);
  revalidatePath(`/t/courses/${courseId}/chapters`);
  revalidatePath(`/courses/${courseId}/chapters`);
  return { ok: true };
}

// ========== 更新章节 ==========

const updateChapterSchema = z.object({
  chapterId: z.string().min(1),
  title: z.string().min(1, "章节标题不能为空").max(80),
  description: z.string().max(500).optional().or(z.literal("")),
});

export async function updateChapterAction(
  _prev: ChapterFormState,
  formData: FormData,
): Promise<ChapterFormState> {
  const parsed = updateChapterSchema.safeParse({
    chapterId: formData.get("chapterId"),
    title: formData.get("title"),
    description: formData.get("description") ?? undefined,
  });
  if (!parsed.success) {
    const fieldErrors: ChapterFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as "title" | "description";
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "请检查输入", fieldErrors };
  }
  const { chapterId, title, description } = parsed.data;

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { courseId: true },
  });
  if (!chapter) return { error: "章节不存在" };

  try {
    await requireCourseTeacher(chapter.courseId, "ASSISTANT");
  } catch (e) {
    return { error: (e as Error).message };
  }

  try {
    await prisma.chapter.update({
      where: { id: chapterId },
      data: {
        title,
        description: description || null,
      },
    });
  } catch (e) {
    return { error: "更新失败：" + (e as Error).message };
  }

  revalidatePath(`/t/courses/${chapter.courseId}`);
  revalidatePath(`/t/courses/${chapter.courseId}/chapters/${chapterId}`);
  revalidatePath(`/courses/${chapter.courseId}/chapters/${chapterId}`);
  return { ok: true };
}

// ========== 删除章节 ==========

export async function deleteChapterAction(chapterId: string) {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { courseId: true, order: true },
  });
  if (!chapter) throw new Error("章节不存在");

  await requireCourseTeacher(chapter.courseId, "OWNER"); // 仅主讲可删

  await prisma.$transaction(async (tx) => {
    // 先把后续章节 order 全部 -1 避免 unique 冲突
    await tx.chapter.delete({ where: { id: chapterId } });
    await tx.chapter.updateMany({
      where: { courseId: chapter.courseId, order: { gt: chapter.order } },
      data: { order: { decrement: 1 } },
    });
  });

  revalidatePath(`/t/courses/${chapter.courseId}`);
  revalidatePath(`/courses/${chapter.courseId}/chapters`);
}

// ========== 章节排序 ==========

const reorderSchema = z.object({
  courseId: z.string().min(1),
  orderedIds: z.array(z.string()).min(1),
});

export async function reorderChaptersAction(input: z.input<typeof reorderSchema>) {
  const parsed = reorderSchema.parse(input);
  await requireCourseTeacher(parsed.courseId, "ASSISTANT");

  // 校验：orderedIds 必须完全等于该课程所有章节 id 集合
  const existing = await prisma.chapter.findMany({
    where: { courseId: parsed.courseId },
    select: { id: true },
  });
  const existingSet = new Set(existing.map((c) => c.id));
  const submittedSet = new Set(parsed.orderedIds);
  if (
    existingSet.size !== submittedSet.size ||
    ![...existingSet].every((id) => submittedSet.has(id))
  ) {
    throw new Error("章节排序数据不一致，请刷新页面");
  }

  // 两步：先全部置为负值（避开 unique），再写回 0..n
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < parsed.orderedIds.length; i++) {
      await tx.chapter.update({
        where: { id: parsed.orderedIds[i] },
        data: { order: -(i + 1) },
      });
    }
    for (let i = 0; i < parsed.orderedIds.length; i++) {
      await tx.chapter.update({
        where: { id: parsed.orderedIds[i] },
        data: { order: i + 1 },
      });
    }
  });

  revalidatePath(`/t/courses/${parsed.courseId}`);
  revalidatePath(`/courses/${parsed.courseId}/chapters`);
}