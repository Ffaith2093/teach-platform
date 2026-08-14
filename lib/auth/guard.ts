// 角色守卫占位 · P1 认证切片将实现
// SPEC §1.3: 所有 /api/** 路由在处理前必须校验 session 与角色
import type { Role } from "@prisma/client";

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
 * P1 阶段实现：从 Auth.js v5 的 session 取 user
 * P0 阶段为占位，调用即抛错
 */
export async function requireRole(_roles: Role[]): Promise<{ userId: string; role: Role }> {
  throw new UnauthorizedError("P1 认证尚未实现");
}

export async function requireCourseMember(_courseId: string) {
  throw new UnauthorizedError("P1 认证尚未实现");
}

export async function requireClassStudent(_classId: string) {
  throw new UnauthorizedError("P1 认证尚未实现");
}
