"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";

const loginSchema = z.object({
  identifier: z.string().min(1, "请输入邮箱 / 学号 / 工号"),
  password: z.string().min(1, "请输入密码"),
});

export type LoginState = {
  error?: string;
  fieldErrors?: { identifier?: string; password?: string };
};

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const fieldErrors: LoginState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof NonNullable<LoginState["fieldErrors"]>;
      fieldErrors[key] = issue.message;
    }
    return { error: "请检查输入", fieldErrors };
  }

  try {
    await signIn("credentials", {
      identifier: parsed.data.identifier,
      password: parsed.data.password,
      redirect: false,
    });
    return {}; // 成功由客户端 router.refresh + 跳转处理
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.type === "CredentialsSignin") {
        return { error: "账号或密码错误" };
      }
      return { error: e.message };
    }
    throw e;
  }
}

const changePasswordSchema = z
  .object({
    oldPassword: z.string().min(1, "请输入当前密码"),
    newPassword: z
      .string()
      .min(8, "新密码至少 8 位")
      .regex(/[a-zA-Z]/, "需包含字母")
      .regex(/\d/, "需包含数字"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "两次输入不一致",
    path: ["confirmPassword"],
  })
  .refine((v) => v.newPassword !== v.oldPassword, {
    message: "新密码不能与当前密码相同",
    path: ["newPassword"],
  });

export type ChangePasswordState = {
  error?: string;
  fieldErrors?: Partial<Record<"oldPassword" | "newPassword" | "confirmPassword", string>>;
  ok?: boolean;
};

export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  // 在 Server Action 里直接用 auth() 取当前 session
  const { auth } = await import("@/auth");
  const session = await auth();
  if (!session?.user) return { error: "会话已过期，请重新登录" };

  const parsed = changePasswordSchema.safeParse({
    oldPassword: formData.get("oldPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    const fieldErrors: ChangePasswordState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof NonNullable<ChangePasswordState["fieldErrors"]>;
      fieldErrors[key] = issue.message;
    }
    return { error: "请检查输入", fieldErrors };
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return { error: "账号不存在" };

  const ok = await bcrypt.compare(parsed.data.oldPassword, user.passwordHash);
  if (!ok) return { error: "当前密码错误", fieldErrors: { oldPassword: "不正确" } };

  const newHash = await bcrypt.hash(parsed.data.newPassword, 12); // SPEC §7 bcrypt(cost=12)
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: newHash, mustChangePassword: false, lastLoginAt: new Date() },
  });

  return { ok: true };
}

export async function signOutAction() {
  await signOut({ redirect: false });
  redirect("/login");
}
