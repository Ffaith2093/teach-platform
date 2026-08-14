/**
 * 资源下载（GET /api/resources/[id]/download）
 *
 * 鉴权（SPEC §4 P4 验收：非选课学生无法下载）：
 *   - ADMIN: 任何资源
 *   - TEACHER: 必须在该资源的 Resource.courseId 对应课程的 CourseTeacher
 *   - STUDENT: 必须在自己班级与该课程有 CourseClass 关联（即「已选课」）
 *
 * 返回：流式响应 + Content-Disposition: attachment; filename*=UTF-8''<encoded>
 * 副作用：资源 downloads 字段 +1
 *
 * 安全：绝不返回磁盘路径或 storedName；绝不暴露 UPLOAD_DIR 给前端。
 */
import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveStoredPath } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const resource = await prisma.resource.findUnique({
    where: { id },
    select: {
      id: true,
      courseId: true,
      name: true,
      storedName: true,
      mimeType: true,
      sizeBytes: true,
    },
  });
  if (!resource) return NextResponse.json({ message: "资源不存在" }, { status: 404 });

  const ok = await canDownload(session.user.id, session.user.role, resource.courseId);
  if (!ok) {
    return NextResponse.json({ message: "无权下载" }, { status: 403 });
  }

  // 取磁盘绝对路径（已校验 storedName 无路径穿越字符）
  let absolutePath: string;
  try {
    absolutePath = resolveStoredPath(resource.courseId, resource.storedName);
  } catch {
    return NextResponse.json({ message: "存储路径异常" }, { status: 500 });
  }

  // 文件可能丢失（磁盘清理过 / 没上传完）
  let fileStat;
  try {
    fileStat = await stat(absolutePath);
  } catch {
    return NextResponse.json({ message: "文件已丢失" }, { status: 410 });
  }

  // 异步 +1 下载次数（不阻塞响应）
  prisma.resource.update({
    where: { id: resource.id },
    data: { downloads: { increment: 1 } },
  }).catch(() => {});

  // 把 Node Readable 转 Web ReadableStream
  const nodeStream = createReadStream(absolutePath);
  const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;

  // RFC 5987: filename*=UTF-8''<percent-encoded>
  const filenameStar = encodeURIComponent(resource.name);

  return new Response(webStream, {
    headers: {
      "Content-Type": resource.mimeType || "application/octet-stream",
      "Content-Length": String(fileStat.size),
      "Content-Disposition": `attachment; filename="${fallbackAscii(resource.name)}"; filename*=UTF-8''${filenameStar}`,
      "Cache-Control": "private, max-age=0, no-store",
    },
  });
}

/** 把中文文件名转成一个 ASCII fallback（避免某些老客户端不解 filename*） */
function fallbackAscii(name: string): string {
  const ascii = name.replace(/[^\x20-\x7E]/g, "_");
  return ascii || "download";
}

/** 鉴权 */
async function canDownload(
  userId: string,
  role: string,
  courseId: string,
): Promise<boolean> {
  if (role === "ADMIN") return true;

  if (role === "TEACHER") {
    const m = await prisma.courseTeacher.findUnique({
      where: { courseId_teacherId: { courseId, teacherId: userId } },
    });
    return !!m;
  }

  if (role === "STUDENT") {
    // 学生须：自己的班级在该课程的 CourseClass 里
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { classId: true },
    });
    if (!me?.classId) return false;
    const linked = await prisma.courseClass.findFirst({
      where: { courseId, classId: me.classId },
    });
    return !!linked;
  }

  return false;
}
