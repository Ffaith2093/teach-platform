import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/shell/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ChevronRight,
  Folder,
  FileText,
  FileCode,
  Image as ImageIcon,
  Film,
  Archive,
  Presentation,
  Sheet,
  Download,
} from "lucide-react";
import { formatBytes, iconForExt } from "@/lib/storage/format";

export const metadata = { title: "课程资源" };

export default async function StudentCourseResourcesPage({
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

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { classId: true },
  });
  if (!me?.classId) redirect("/dashboard");

  // 课程存在 + 学生在该课程的班级列表里（SPEC P4：非选课学生无法下载）
  const course = await prisma.course.findUnique({
    where: { id },
    select: { id: true, title: true, isArchived: true },
  });
  if (!course) notFound();
  if (course.isArchived) notFound();

  const accessible = await prisma.courseClass.findFirst({
    where: { courseId: id, classId: me.classId },
  });
  if (!accessible) redirect("/dashboard?error=forbidden");

  const currentFolder = folderParam && folderParam.startsWith("/") ? folderParam : "/";

  const rows = await prisma.resource.findMany({
    where: { courseId: id, isHidden: false },
    orderBy: [{ folder: "asc" }, { createdAt: "desc" }],
    include: { uploader: { select: { name: true } } },
  });

  const folders = Array.from(new Set(rows.map((r) => r.folder))).sort();

  // 当前目录直接子目录
  const subfolders = folders
    .filter((f) => {
      const prefix = currentFolder === "/" ? "/" : currentFolder + "/";
      return f.startsWith(prefix) && f !== currentFolder;
    })
    .map((f) => {
      const rest = f.slice((currentFolder === "/" ? "/" : currentFolder + "/").length);
      const seg = rest.split("/")[0];
      if (!seg) return null;
      return { full: (currentFolder === "/" ? "/" : currentFolder + "/") + seg, name: seg };
    })
    .filter((v): v is { full: string; name: string } => !!v)
    .filter((v, i, arr) => arr.findIndex((a) => a.full === v.full) === i);

  const itemsHere = rows.filter((r) => r.folder === currentFolder);

  // 面包屑
  const crumbs: { label: string; path: string }[] = [{ label: "根目录", path: "/" }];
  if (currentFolder !== "/") {
    const segs = currentFolder.split("/").filter(Boolean);
    let acc = "";
    for (const s of segs) {
      acc += "/" + s;
      crumbs.push({ label: s, path: acc });
    }
  }

  return (
    <>
      <Topbar
        crumbs={[
          { label: course.title, href: `/courses/${id}` },
          { label: "课程资源" },
        ]}
      />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">课程资源</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              共 <b className="num text-foreground">{rows.length}</b> 份资料，按目录分类。
            </p>
          </div>

          {/* 面包屑 */}
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {crumbs.map((c, i) => (
              <span key={c.path} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                {i === crumbs.length - 1 ? (
                  <span className="font-medium text-foreground">{c.label}</span>
                ) : (
                  <a
                    href={`?folder=${encodeURIComponent(c.path)}`}
                    className="rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {c.label}
                  </a>
                )}
              </span>
            ))}
          </nav>

          {/* 子目录 */}
          {subfolders.length > 0 && (
            <Card>
              <CardContent className="p-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {subfolders.map((s) => (
                    <a
                      key={s.full}
                      href={`?folder=${encodeURIComponent(s.full)}`}
                      className="flex items-center gap-2 rounded-lg border border-border bg-card p-3 text-sm transition-colors hover:bg-muted"
                    >
                      <Folder className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate">{s.name}</span>
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 文件列表 */}
          {itemsHere.length === 0 && subfolders.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Folder className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">此目录下还没有资源</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    资源由教师上传，请稍后再来查看。
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {itemsHere.map((r) => {
                    const ext = r.name.split(".").pop()?.toLowerCase() ?? "";
                    const iconName = iconForExt(ext);
                    const Icon =
                      iconName === "Image"
                        ? ImageIcon
                        : iconName === "Video"
                          ? Film
                          : iconName === "Archive"
                            ? Archive
                            : iconName === "Presentation"
                              ? Presentation
                              : iconName === "Sheet"
                                ? Sheet
                                : iconName === "Code2"
                                  ? FileCode
                                  : FileText;
                    return (
                      <div
                        key={r.id}
                        className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/40"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <a
                              href={`/api/resources/${r.id}/download`}
                              download={r.name}
                              className="block truncate text-sm font-medium text-foreground hover:text-primary"
                            >
                              {r.name}
                            </a>
                            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="num">{formatBytes(r.sizeBytes)}</span>
                              <span>·</span>
                              <span>上传者 {r.uploader.name}</span>
                              <span>·</span>
                              <span className="num">{r.downloads} 次下载</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="default" className="font-normal">
                            .{ext}
                          </Badge>
                          <a
                            href={`/api/resources/${r.id}/download`}
                            download={r.name}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            title="下载"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </>
  );
}
