import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe 配置（中间件用）。
 * 不在此文件引用 Prisma / bcryptjs（Edge Runtime 不支持 Node API）。
 * 完整 Provider 定义在 auth.ts。
 */
export const authConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: { strategy: "jwt" },
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isLoggedIn = !!auth?.user;

      // 公开路由：landing、login、change-password
      const publicPaths = ["/", "/login", "/change-password"];
      const isPublic =
        publicPaths.includes(pathname) ||
        pathname.startsWith("/_next") ||
        pathname.startsWith("/api/auth");

      if (isPublic) return true;
      if (!isLoggedIn) return false;

      // 已登录用户访问 login：踢回 dashboard
      if (pathname === "/login") {
        const role = auth?.user?.role;
        return Response.redirect(
          new URL(
            role === "ADMIN" ? "/admin" : role === "TEACHER" ? "/t/dashboard" : "/dashboard",
            request.nextUrl,
          ),
        );
      }

      // 已登录访问根路径：按角色跳转
      if (pathname === "/") {
        const role = auth?.user?.role;
        return Response.redirect(
          new URL(
            role === "ADMIN" ? "/admin" : role === "TEACHER" ? "/t/dashboard" : "/dashboard",
            request.nextUrl,
          ),
        );
      }

      // 角色越权检查
      const role = auth?.user?.role;
      if (pathname.startsWith("/admin") && role !== "ADMIN") return false;
      if (pathname.startsWith("/t/") && role !== "TEACHER" && role !== "ADMIN") return false;
      // 学生路由不强制拦 ADMIN/TEACHER（admin/teachers 可能需要演示）

      return true;
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        // user 来自 authorize() 返回值
        token.id = user.id;
        token.role = user.role;
        token.name = user.name;
        token.mustChangePassword = user.mustChangePassword;
      }
      if (trigger === "update" && session) {
        if (typeof session.mustChangePassword === "boolean") {
          token.mustChangePassword = session.mustChangePassword;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "ADMIN" | "TEACHER" | "STUDENT";
        session.user.name = token.name as string;
        session.user.mustChangePassword = token.mustChangePassword as boolean;
      }
      return session;
    },
  },
  providers: [], // 在 auth.ts 注入
} satisfies NextAuthConfig;
