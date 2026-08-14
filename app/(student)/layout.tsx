import { SidebarShell } from "@/components/shell/sidebar-nav";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <SidebarShell
        role="STUDENT"
        user={{ name: "示例学生", subtitle: "高一(1)班 · 信息学", initial: "生" }}
      />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
