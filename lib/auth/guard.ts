import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export class UnauthorizedError extends Error {
  constructor(message = "未登录") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "权限不足") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * 服务端：要求 session 存在
 * - 未登录：重定向到 /login（带 callbackUrl）
 * - 角色不匹配：抛 ForbiddenError（API 路由）或重定向 /login（页面）
 */
export async function requireSession() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  return session;
}

/**
 * 要求特定角色之一
 */
export async function requireRole(roles: Role[]) {
  const session = await requireSession();
  if (!roles.includes(session.user.role)) {
    redirect("/login?error=forbidden");
  }
  return session;
}

/**
 * 教师必须加入该课程的 CourseTeacher
 * OWNER / ASSISTANT / CONTRIBUTOR 都算成员
 */
export async function requireCourseMember(courseId: string) {
  const session = await requireSession();
  if (session.user.role === "ADMIN") return session; // 管理员放行

  if (session.user.role === "TEACHER") {
    const member = await prisma.courseTeacher.findUnique({
      where: { courseId_teacherId: { courseId, teacherId: session.user.id } },
    });
    if (!member) {
      redirect("/login?error=forbidden");
    }
  } else {
    redirect("/login?error=forbidden");
  }
  return session;
}

/**
 * 学生必须在该班级（通过 classId 关联）
 */
export async function requireClassStudent(classId: string) {
  const session = await requireSession();
  if (session.user.role !== "STUDENT") {
    redirect("/login?error=forbidden");
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { classId: true },
  });
  if (user?.classId !== classId) {
    redirect("/login?error=forbidden");
  }
  return session;
}

/**
 * 工具：把当前 session user 转成 Prisma where 条件
 */
export function whereFromSession(session: { user: { id: string; role: Role } }) {
  switch (session.user.role) {
    case "ADMIN":
      return {}; // 管理员看全部
    case "TEACHER":
      // 教师只能看自己任课班级所在课程的范围内数据（复杂查询见具体业务）
      return { teacherId: session.user.id };
    case "STUDENT":
      return { studentId: session.user.id };
  }
}
