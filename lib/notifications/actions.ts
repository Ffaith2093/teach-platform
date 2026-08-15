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
    classId: parsed.classId,
  });

  revalidatePath("/notifications");
  revalidatePath("/dashboard");
  revalidatePath(`/my-class`);
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

const announceCourseSchema = z.object({
  courseId: z.string().min(1),
  title: z.string().min(1, "请输入标题").max(100),
  body: z.string().min(1, "请输入公告内容").max(2000),
});

/**
 * 受众工具：获取课程下所有 ACTIVE STUDENT + 同课程其他 CourseTeacher (OWNER/ASSISTANT，不含自己)
 * 返回带 role 的 list，方便给教师/学生用不同 href。
 *
 * 用于：announceCourseAction、exam 发布通知 等场景。
 */
export async function getCourseAudience(courseId: string, excludeUserId?: string) {
  const classIds = (
    await prisma.courseClass.findMany({
      where: { courseId },
      select: { classId: true },
    })
  ).map((cc) => cc.classId);
  const recipients = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { role: "STUDENT", classId: { in: classIds } },
        {
          role: "TEACHER",
          ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
          courseTeachers: {
            some: { courseId, role: { in: ["OWNER", "ASSISTANT"] } },
          },
        },
      ],
    },
    select: { id: true, role: true },
  });
  return recipients;
}

/**
 * 给课程受众按角色发通知：
 * - student → hrefStudent
 * - teacher → hrefTeacher
 * courseId 用于通知中心按课程分组。
 *
 * 返回发送条数。
 */
export async function notifyCourseAudience(input: {
  audience: { id: string; role: "STUDENT" | "TEACHER" }[];
  title: string;
  body: string;
  hrefStudent: string;
  hrefTeacher: string;
  courseId: string;
}) {
  let sent = 0;
  for (const r of input.audience) {
    const href = r.role === "TEACHER" ? input.hrefTeacher : input.hrefStudent;
    await notify({
      userId: r.id,
      title: input.title,
      body: input.body,
      href,
      courseId: input.courseId,
    });
    sent += 1;
  }
  return sent;
}

/**
 * 教师向课程发布公告：给该课程下所有班级的 ACTIVE STUDENT + 同课程其他 CourseTeacher
 * （OWNER/ASSISTANT；不包括自己）发送 Notification，每条带 courseId 作用域。
 *
 * 权限：教师必须是该课程的 CourseTeacher（OWNER/ASSISTANT）。
 */
export async function announceCourseAction(input: z.input<typeof announceCourseSchema>) {
  const session = await auth();
  const teacherId = session!.user.id;
  if (session!.user.role !== "TEACHER") throw new Error("仅教师可发布公告");

  const parsed = announceCourseSchema.parse(input);

  // 课程存在 + 教师是该课程任课
  const course = await prisma.course.findUnique({
    where: { id: parsed.courseId },
    select: {
      id: true,
      title: true,
      teachers: {
        where: { teacherId },
        select: { role: true },
      },
    },
  });
  if (!course) throw new Error("课程不存在");
  const myRole = course.teachers[0]?.role;
  if (myRole !== "OWNER" && myRole !== "ASSISTANT") {
    throw new Error("您未任该课程主讲/助教，无权发布公告");
  }

  // 受众：课程下所有班级的 ACTIVE STUDENT + 同课程其他 CourseTeacher（不含自己）
  const audience = (await getCourseAudience(parsed.courseId, teacherId)) as {
    id: string;
    role: "STUDENT" | "TEACHER";
  }[];

  const sent = await notifyCourseAudience({
    audience,
    title: parsed.title,
    body: parsed.body,
    hrefStudent: `/courses/${parsed.courseId}`,
    hrefTeacher: `/t/courses/${parsed.courseId}`,
    courseId: parsed.courseId,
  });

  revalidatePath(`/courses/${parsed.courseId}`);
  revalidatePath(`/t/courses/${parsed.courseId}`);
  revalidatePath("/notifications");
  return { sent, courseName: course.title };
}

/**
 * 试卷发布通知：给课程下所有班级 ACTIVE STUDENT + 同课程其他 CourseTeacher 发通知。
 * - 学生 → /exams/[id]
 * - 教师 → /t/exams/[id]
 * - 不给发布者本人发
 * 调用方负责保证 `publisherId` 是当前用户（已经在该课程 OWNER/ASSISTANT 中）。
 */
export async function notifyExamPublished(input: {
  examId: string;
  examTitle: string;
  courseId: string;
  openAt: Date;
  durationMin: number;
  publisherId: string;
}) {
  const audience = (await getCourseAudience(input.courseId, input.publisherId)) as {
    id: string;
    role: "STUDENT" | "TEACHER";
  }[];
  const openLabel = input.openAt.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const body = `开考时间 ${openLabel} · 时长 ${input.durationMin} 分钟`;
  const sent = await notifyCourseAudience({
    audience,
    title: `试卷已开放：《${input.examTitle}》`,
    body,
    hrefStudent: `/exams/${input.examId}`,
    hrefTeacher: `/t/exams/${input.examId}`,
    courseId: input.courseId,
  });

  revalidatePath(`/exams/${input.examId}`);
  revalidatePath(`/t/exams/${input.examId}`);
  revalidatePath("/notifications");
  return { sent };
}