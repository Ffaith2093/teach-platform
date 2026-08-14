import { SidebarShell } from "@/components/shell/sidebar-nav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <SidebarShell
        role="ADMIN"
        user={{ name: "李管理", subtitle: "校信息中心", initial: "管" }}
      />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
