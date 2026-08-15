import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Topbar } from "@/components/shell/topbar";
import { ResourcesManager } from "./_components/resources-manager";
import { formatBytes } from "@/lib/storage/format";
import {
  FileText,
  Folder,
  HardDrive,
  Download,
} from "lucide-react";

export const metadata = { title: "课程资源" };

export default async function TeacherCourseResourcesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ folder?: string }>;
}) {
  const { id } = await params;
  const { folder: folderParam } = await searchParams;
  const session = await auth();
  const userId = session!.user.id;

  const course = await prisma.course.findUnique({
    where: { id },
    select: { id: true, title: true },
  });
  if (!course) notFound();

  // 教师必须是该课程成员
  const member = await prisma.courseTeacher.findUnique({
    where: { courseId_teacherId: { courseId: id, teacherId: userId } },
  });
  if (!member) redirect("/t/courses?error=forbidden");

  // 当前目录（默认根）
  const currentFolder = folderParam && folderParam.startsWith("/") ? folderParam : "/";

  const rows = await prisma.resource.findMany({
    where: { courseId: id },
    orderBy: [{ folder: "asc" }, { createdAt: "desc" }],
    include: {
      uploader: { select: { name: true } },
    },
  });

  const folders = Array.from(new Set(rows.map((r) => r.folder))).sort();

  const resources = rows.map((r) => ({
    id: r.id,
    name: r.name,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    folder: r.folder,
    downloads: r.downloads,
    createdAt: r.createdAt.toISOString(),
    uploaderName: r.uploader.name,
  }));

  // 顶部 4 张统计卡
  const totalBytes = resources.reduce((s, r) => s + r.sizeBytes, 0);
  const totalDownloads = resources.reduce((s, r) => s + r.downloads, 0);

  return (
    <>
      <Topbar
        crumbs={[
          { label: "我的课程", href: "/t/courses" },
          { label: course.title, href: `/t/courses/${id}` },
          { label: "资源管理" },
        ]}
      />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{course.title} · 资源管理</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              课程内所有教师均可上传与删除。删除后无法恢复，请谨慎。
            </p>
          </div>

          {/* 顶部 4 张统计卡 */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <span className="text-sm text-muted-foreground">总文件数</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                    <FileText className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3 text-3xl font-bold tracking-tight num">
                  {resources.length}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">本课程所有目录</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <span className="text-sm text-muted-foreground">目录数</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-subtle text-accent">
                    <Folder className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3 text-3xl font-bold tracking-tight num">
                  {folders.length}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">含根目录</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <span className="text-sm text-muted-foreground">总大小</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning-subtle text-warning">
                    <HardDrive className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3 text-3xl font-bold tracking-tight num">
                  {resources.length === 0 ? "—" : formatBytes(totalBytes)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">磁盘占用</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <span className="text-sm text-muted-foreground">总下载</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success-subtle text-success">
                    <Download className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3 text-3xl font-bold tracking-tight num">
                  {totalDownloads}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">累计下载次数</div>
              </CardContent>
            </Card>
          </div>

          <ResourcesManager
            courseId={course.id}
            resources={resources}
            folders={folders}
            currentFolder={currentFolder}
          />
        </div>
      </main>
    </>
  );
}
