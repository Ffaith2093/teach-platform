"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Upload,
  ChevronUp,
  ChevronRight,
  FileText,
  FileCode,
  Image as ImageIcon,
  Film,
  Archive,
  Presentation,
  Sheet,
  Download,
  Trash2,
  Folder,
  FolderPlus,
  AlertCircle,
  Loader2,
} from "lucide-react";
import {
  createFolderAction,
  deleteResourceAction,
} from "@/app/t/courses/[id]/resources/actions";
import {
  EXT_WHITELIST,
  formatBytes,
  iconForExt,
} from "@/lib/storage/format";

type Resource = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  folder: string;
  downloads: number;
  createdAt: string;
  uploaderName: string;
};

export function ResourcesManager({
  courseId,
  resources,
  folders,
  currentFolder,
}: {
  courseId: string;
  resources: Resource[];
  /** 当前课程出现过的所有 folder（用于面包屑和树） */
  folders: string[];
  currentFolder: string;
}) {
  const router = useRouter();
  const [dragOver, setDragOver] = React.useState(false);
  const [uploading, setUploading] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // 找当前 folder 下的子目录（不含当前自身）
  const subfolders = React.useMemo(() => {
    const prefix = currentFolder === "/" ? "/" : currentFolder + "/";
    return folders
      .filter((f) => f.startsWith(prefix) && f !== currentFolder)
      .map((f) => {
        const rest = f.slice(prefix.length);
        // 立即子目录（first segment）
        const seg = rest.split("/")[0];
        if (!seg) return null;
        return {
          full: prefix + seg,
          name: seg,
        };
      })
      .filter((x): x is { full: string; name: string } => !!x)
      .filter((v, i, arr) => arr.findIndex((a) => a.full === v.full) === i);
  }, [folders, currentFolder]);

  const itemsHere = resources.filter((r) => r.folder === currentFolder);

  /** 上传一个 File */
  async function uploadFiles(files: FileList | File[]) {
    setError(null);
    const arr = Array.from(files);
    if (arr.length === 0) return;
    for (const f of arr) {
      setUploading(f.name);
      try {
        const fd = new FormData();
        fd.set("courseId", courseId);
        fd.set("folder", currentFolder);
        fd.set("file", f);
        const res = await fetch("/api/resources/upload", {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({ message: "上传失败" }))) as {
            message?: string;
          };
          throw new Error(j.message ?? `HTTP ${res.status}`);
        }
      } catch (e) {
        setError((e as Error).message);
        setUploading(null);
        return;
      }
    }
    setUploading(null);
    router.refresh();
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length === 0) return;
    // 客户端白名单预校验
    for (const f of Array.from(e.dataTransfer.files)) {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      if (!EXT_WHITELIST[ext]) {
        setError(`不支持的文件类型 .${ext}（${f.name}）`);
        return;
      }
      if (f.size > 100 * 1024 * 1024) {
        setError(`文件 ${f.name} 超过 100MB`);
        return;
      }
    }
    void uploadFiles(e.dataTransfer.files);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`确认删除「${name}」？此操作不可恢复。`)) return;
    const res = await deleteResourceAction(id);
    if (res.error) {
      alert(res.error);
      return;
    }
    router.refresh();
  }

  // 面包屑
  const crumbs = React.useMemo(() => {
    const parts = currentFolder.split("/").filter(Boolean);
    const out: { label: string; path: string }[] = [{ label: "根目录", path: "/" }];
    let acc = "";
    for (const p of parts) {
      acc += "/" + p;
      out.push({ label: p, path: acc });
    }
    return out;
  }, [currentFolder]);

  return (
    <div className="flex flex-col gap-6">
      {/* 上传区 */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          dragOver
            ? "border-primary bg-primary-subtle/40"
            : "border-border bg-muted/30"
        }`}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-card text-muted-foreground">
            <Upload className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              拖拽文件到这里，或
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="ml-1 text-primary underline-offset-2 hover:underline"
              >
                点击选择
              </button>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              单文件 ≤ 100MB · 支持 {Object.keys(EXT_WHITELIST).join(" ")}
            </p>
          </div>
          {uploading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>正在上传 {uploading}…</span>
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger-subtle/40 px-3 py-2 text-xs text-danger">
              <AlertCircle className="h-3 w-3" />
              <span>{error}</span>
            </div>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void uploadFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* 面包屑 + 新建目录 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          {crumbs.map((c, i) => (
            <React.Fragment key={c.path}>
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
            </React.Fragment>
          ))}
        </nav>
        {creating ? (
          <form
            action={async (fd: FormData) => {
              fd.set("courseId", courseId);
              fd.set("parent", currentFolder);
              const res = await createFolderAction(undefined, fd);
              setCreating(false);
              if (res.error) {
                alert(res.error);
                return;
              }
              router.refresh();
            }}
            className="flex items-center gap-2"
          >
            <input
              name="folder"
              autoFocus
              placeholder="新目录名"
              className="h-8 rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
            />
            <Button size="sm" type="submit">
              创建
            </Button>
            <Button size="sm" variant="outline" type="button" onClick={() => setCreating(false)}>
              取消
            </Button>
          </form>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <FolderPlus className="h-3.5 w-3.5" />
            新建子目录
          </Button>
        )}
      </div>

      {/* 子目录列表 */}
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

      {/* 当前目录的文件 */}
      {itemsHere.length === 0 && subfolders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Folder className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">此目录下还没有文件</p>
              <p className="mt-1 text-xs text-muted-foreground">
                拖拽文件到上方上传区，或新建子目录。
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {itemsHere.map((r) => (
                <ResourceRow
                  key={r.id}
                  r={r}
                  onDelete={() => handleDelete(r.id, r.name)}
                  canDelete
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ResourceRow({
  r,
  onDelete,
  canDelete,
}: {
  r: Resource;
  onDelete?: () => void;
  canDelete?: boolean;
}) {
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
    <div className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/40">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <a
            href={`/api/resources/${r.id}/download`}
            className="block truncate text-sm font-medium text-foreground hover:text-primary"
            download={r.name}
          >
            {r.name}
          </a>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="num">{formatBytes(r.sizeBytes)}</span>
            <span>·</span>
            <span>上传者 {r.uploaderName}</span>
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
        {canDelete && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-danger-subtle hover:text-danger"
            title="删除"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
