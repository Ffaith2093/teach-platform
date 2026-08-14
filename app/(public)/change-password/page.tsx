import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ChangePasswordForm } from "@/components/change-password-form";

export const metadata: Metadata = { title: "修改密码" };

export default async function ChangePasswordPage() {
  const session = await auth();
  // 未登录：踢回登录页
  if (!session?.user) redirect("/login");
  // 已登录且不需要改密：直接进 dashboard
  if (!session.user.mustChangePassword) {
    const dest =
      session.user.role === "ADMIN" ? "/admin" : session.user.role === "TEACHER" ? "/t/dashboard" : "/dashboard";
    redirect(dest);
  }
  return (
    <main className="grid min-h-[calc(100vh-4rem)] place-items-center bg-gradient-to-b from-primary-subtle/30 via-background to-background px-4 py-12">
      <ChangePasswordForm />
    </main>
  );
}
