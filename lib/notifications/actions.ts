"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notify, notifyMany } from "./index";

const announceSchema = z.object({
  classId: z.string().min(1),
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(2000),
});

/**
 * 教师向班级发布公告：给该班所有 ACTIVE 学生 + 班级所有 CourseTeacher 发 Notification。
 * 权限：教师必须是该班所属任一课程的 CourseTeacher（OWNER/ASSISTANT）。
 */
export async function announceClassAction(input: z.input<typeof announceSchema>) {
  const session = await auth();
  const teacherId = session!.user.id;
  if (session!.user.role !== "TEACHER") throw new Error("仅教师可发布公告");

  const parsed = announceSchema.parse(input);

  const cls = await prisma.class.findUnique({
    where: { id: parsed.classId },
    select: {
      id: true,
      name: true,
      grade: { select: { name: true } },
      courseClasses: { select: { courseId: true } },
    },
  });
  if (!cls) throw new Error("班级不存在");

  const courseIds = cls.courseClasses.map((cc) => cc.courseId);
  if (courseIds.length === 0) throw new Error("该班未关联任何课程");

  const myTeaching = await prisma.courseTeacher.findFirst({
    where: { teacherId, courseId: { in: courseIds } },
    select: { id: true },
  });
  if (!myTeaching) throw new Error("您未任教该班级，无权发布公告");

  const recipients = await prisma.user.findMany({
    where: {
      OR: [
        { classId: parsed.classId, role: "STUDENT", status: "ACTIVE" },
        {
          role: "TEACHER",
          status: "ACTIVE",
          id: { not: teacherId }, // 不给自己发
          courseTeachers: { some: { courseId: { in: courseIds } } },
        },
      ],
    },
    select: { id: true },
  });

  const sent = await notifyMany({
    userIds: recipients.map((r) => r.id),
    title: parsed.title,
    body: parsed.body,
    href: "/notifications",
  });

  revalidatePath("/notifications");
  return { sent, className: `${cls.grade.name} · ${cls.name}` };
}

const markReadSchema = z.object({ id: z.string().min(1) });

export async function markNotificationReadAction(input: z.input<typeof markReadSchema>) {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");
  const parsed = markReadSchema.parse(input);
  await prisma.notification.updateMany({
    where: { id: parsed.id, userId: session.user.id },
    data: { isRead: true },
  });
  revalidatePath("/notifications");
}

export async function markAllNotificationsReadAction() {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");
  await prisma.notification.updateMany({
    where: { userId: session.user.id, isRead: false },
    data: { isRead: true },
  });
  revalidatePath("/notifications");
}