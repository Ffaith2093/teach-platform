import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";

const credentialsSchema = z.object({
  identifier: z.string().min(1, "请输入邮箱 / 学号 / 工号"),
  password: z.string().min(1, "请输入密码"),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        identifier: { label: "邮箱/学号/工号", type: "text" },
        password: { label: "密码", type: "password" },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const { identifier, password } = parsed.data;

        // 1. 优先按 email 查找；其次按学号/工号
        const user = await prisma.user.findFirst({
          where: {
            OR: [{ email: identifier }, { studentNo: identifier }, { teacherNo: identifier }],
          },
        });

        if (!user) return null;
        if (user.status !== "ACTIVE") {
          // SPEC §1.2: DISABLED 拒绝登录
          throw new Error("账号已停用，请联系管理员");
        }

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
});
