import { Topbar } from "@/components/shell/topbar";
import { VersionHistory } from "@/components/version-history";

export const metadata = { title: "版本更新" };

export default function TeacherUpdatesPage() {
  return (
    <>
      <Topbar crumbs={[{ label: "版本更新" }]} />
      <main className="flex-1 p-8">
        <VersionHistory />
      </main>
    </>
  );
}
