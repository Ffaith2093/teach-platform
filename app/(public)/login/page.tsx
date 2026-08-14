import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";

export const metadata: Metadata = { title: "登录" };

export default function LoginPage() {
  return (
    <main className="grid min-h-[calc(100vh-4rem)] place-items-center bg-gradient-to-b from-primary-subtle/30 via-background to-background px-4 py-12">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
