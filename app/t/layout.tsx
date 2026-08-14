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
  if (session.user.mustChangePassword) redirect("/change-password");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      subjects: true,
      classTeachers: {
        select: { class: { select: { grade: { select: { name: true } } } } },
      },
    },
  });

  const grades = new Set(user?.classTeachers.map((t) => t.class.grade.name) ?? []);
  const subtitle = user?.subjects.length
    ? `${user.subjects.join(" · ")} · ${[...grades].join("/") || "未分配"}`
    : session.user.email;

  return (
    <div className="flex min-h-screen">
      <SidebarShell
        role="TEACHER"
        user={{
          name: user?.name ?? "教师",
          subtitle,
          initial: (user?.name ?? "师").slice(0, 1),
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
