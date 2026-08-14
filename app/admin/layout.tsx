import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SidebarShell } from "@/components/shell/sidebar-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/login?error=forbidden");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, mustChangePassword: true },
  });
  // 用 DB 真值，不用 JWT 里登录时的值（改密后 JWT 不会自动更新）
  if (user?.mustChangePassword) redirect("/change-password");

  return (
    <div className="flex min-h-screen">
      <SidebarShell
        role="ADMIN"
        user={{
          name: user?.name ?? "管理员",
          subtitle: user?.email ?? "",
          initial: (user?.name ?? "管").slice(0, 1),
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
