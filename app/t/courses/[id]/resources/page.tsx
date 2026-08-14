import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/shell/topbar";
import { ResourcesManager } from "./_components/resources-manager";

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
