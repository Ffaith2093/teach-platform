import { SidebarShell } from "@/components/shell/sidebar-nav";

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <SidebarShell
        role="TEACHER"
        user={{ name: "王建国", subtitle: "信息技术 · 高一段", initial: "王" }}
      />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
