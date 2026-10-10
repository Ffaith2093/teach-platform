import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";

const credentialsSchema = z.object({
  identifier: z.string().min(1, "请输入邮箱 / 学号 / 工号"),
  password: z.string().min(1, "请输入密码"),
  role: z.enum(["STUDENT", "TEACHER", "ADMIN"]),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        identifier: { label: "邮箱/学号/工号", type: "text" },
        password: { label: "密码", type: "password" },
        role: { label: "角色", type: "text" },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const { identifier, password, role } = parsed.data;

        // 1. 优先按 email 查找；其次按学号/工号
        const user = await prisma.user.findFirst({
          where: {
            OR: [{ email: identifier }, { studentNo: identifier }, { teacherNo: identifier }],
          },
        });

        if (!user) return null;
        if (user.role !== role) return null;
        if (user.status !== "ACTIVE") {
          // SPEC §1.2: DISABLED 拒绝登录
          throw new Error("账号已停用，请联系管理员");
        }

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        // 记录登录时间（lastIp 由 events.signIn 写，那里能拿到 request）
        try {
            await prisma.user.update({
              where: { id: user.id },
              data: { lastLoginAt: new Date() },
            });
          } catch (e) {
            console.error("[auth] update lastLoginAt failed:", e);
          }

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
  events: {
    async signIn({ user }) {
      // 用 events hook 写 lastIp（authorize() 里拿不到 request headers）
      if (!user.id) return;
      try {
        const { headers } = await import("next/headers");
        const h = await headers();
        const ip =
          h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          h.get("x-real-ip") ??
          null;
        if (ip) {
          await prisma.user.update({
            where: { id: user.id },
            data: { lastIp: ip },
          });
        }
      } catch (e) {
        console.error("[auth] signIn event update lastIp failed:", e);
      }
    },
  },
});
