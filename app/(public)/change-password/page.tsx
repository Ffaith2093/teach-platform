import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ChangePasswordForm } from "@/components/change-password-form";

export const metadata: Metadata = { title: "修改密码" };

export default async function ChangePasswordPage() {
  const session = await auth();
  // 未登录：踢回登录页
  if (!session?.user) redirect("/login");

  // 用 DB 真值，不用 JWT 里登录时的值（改密后 JWT 不会自动更新）
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { mustChangePassword: true },
  });
  if (user && !user.mustChangePassword) {
    const dest =
      session.user.role === "ADMIN" ? "/admin" : session.user.role === "TEACHER" ? "/t/dashboard" : "/dashboard";
    redirect(dest);
  }

  return (
    <main className="grid min-h-[calc(100vh-4rem)] place-items-center bg-gradient-to-b from-primary-subtle/30 via-background to-background px-4 py-12">
      <ChangePasswordForm
        successRedirect={
          session.user.role === "ADMIN" ? "/admin" : session.user.role === "TEACHER" ? "/t/dashboard" : "/dashboard"
        }
      />
    </main>
  );
}
