import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SidebarShell } from "@/components/shell/sidebar-nav";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.mustChangePassword) redirect("/change-password");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      studentNo: true,
      class: { select: { name: true, grade: { select: { name: true } } } },
    },
  });

  return (
    <div className="flex min-h-screen">
      <SidebarShell
        role="STUDENT"
        user={{
          name: user?.name ?? "学生",
          subtitle: user?.class ? `${user.class.grade.name} · ${user.class.name}` : session.user.email,
          initial: (user?.name ?? "生").slice(0, 1),
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
