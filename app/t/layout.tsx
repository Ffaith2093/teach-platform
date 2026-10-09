import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SidebarShell } from "@/components/shell/sidebar-nav";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "TEACHER" && session.user.role !== "ADMIN") {
    redirect("/login?error=forbidden");
  }

  const [user, unreadCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        name: true,
        subjects: true,
        email: true,
        mustChangePassword: true,
      },
    }),
    prisma.notification.count({
      where: { userId: session.user.id, isRead: false },
    }),
  ]);
  // 用 DB 真值，不用 JWT 里登录时的值（改密后 JWT 不会自动更新）
  if (user?.mustChangePassword) redirect("/change-password");

  const subtitle = user?.subjects.length ? user.subjects.join(" · ") : (user?.email ?? "教师账号");

  return (
    <div className="flex min-h-screen">
      <SidebarShell
        role="TEACHER"
        user={{
          name: user?.name ?? "教师",
          subtitle,
          initial: (user?.name ?? "师").slice(0, 1),
        }}
        unreadNotifications={unreadCount}
      />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
