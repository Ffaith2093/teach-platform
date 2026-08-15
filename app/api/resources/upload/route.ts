/**
 * 资源上传（POST /api/resources/upload）
 *
 * 前端表单传 FormData:
 *   - courseId: string
 *   - folder: string ("/" or "/第一章")
 *   - file: File
 *
 * 鉴权：教师须为该课程 CourseTeacher（OWNER / ASSISTANT / CONTRIBUTOR 都可上传）
 * 存储：<UPLOAD_DIR>/<courseId>/<uuid>.<ext>
 * 校验：扩展名白名单 + size ≤ 100MB
 */
import { NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCourseAudience, notifyCourseAudience } from "@/lib/notifications/actions";
import {
  EXT_WHITELIST,
  MAX_BYTES,
  StorageError,
  ensureCourseDir,
  generateStoredName,
  validateFolder,
  validateUpload,
} from "@/lib/storage";

export const dynamic = "force-dynamic";
// 上传最大 100MB；要 Next.js 解析 FormData 不因默认限制截断
export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
  if (session.user.role !== "TEACHER" && session.user.role !== "ADMIN") {
    return NextResponse.json({ message: "仅教师可上传" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ message: "请求体不是合法的 multipart/form-data" }, { status: 400 });
  }

  const courseId = String(form.get("courseId") ?? "");
  const folderRaw = String(form.get("folder") ?? "/");
  const file = form.get("file");

  if (!courseId) return NextResponse.json({ message: "缺少 courseId" }, { status: 400 });
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "缺少文件" }, { status: 400 });
  }

  // 课程存在 + 教师是 CourseTeacher
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, title: true, isArchived: true },
  });
  if (!course) return NextResponse.json({ message: "课程不存在" }, { status: 404 });
  if (course.isArchived) {
    return NextResponse.json({ message: "课程已归档，不可上传" }, { status: 400 });
  }

  if (session.user.role === "TEACHER") {
    const member = await prisma.courseTeacher.findUnique({
      where: { courseId_teacherId: { courseId, teacherId: session.user.id } },
    });
    if (!member) {
      return NextResponse.json({ message: "您不在该课程团队中" }, { status: 403 });
    }
  }

  // 校验文件
  let safeName: string;
  let safeMime: string;
  let safeExt: string;
  try {
    const v = validateUpload(file.name, file.type, file.size);
    safeExt = v.ext;
    safeMime = v.mime;
    safeName = file.name; // 用户看到的原始名（含中文）
  } catch (e) {
    if (e instanceof StorageError) {
      return NextResponse.json({ message: e.message }, { status: 400 });
    }
    throw e;
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ message: `文件超过 ${MAX_BYTES / 1024 / 1024}MB` }, { status: 413 });
  }

  let folder: string;
  try {
    folder = validateFolder(folderRaw);
  } catch (e) {
    if (e instanceof StorageError) {
      return NextResponse.json({ message: e.message }, { status: 400 });
    }
    throw e;
  }

  // 写磁盘
  const storedName = generateStoredName(safeExt);
  const courseDir = await ensureCourseDir(courseId);
  const absolutePath = join(courseDir, storedName);
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(absolutePath, bytes);

  // DB 记录
  const resource = await prisma.resource.create({
    data: {
      courseId,
      name: safeName,
      storedName,
      mimeType: safeMime,
      sizeBytes: file.size,
      folder,
      uploaderId: session.user.id,
    },
    select: { id: true, name: true, folder: true, sizeBytes: true, mimeType: true, createdAt: true },
  });

  // 通知课程受众（新资源）
  try {
    const [audience, uploader] = await Promise.all([
      getCourseAudience(courseId, session.user.id),
      prisma.user.findUnique({ where: { id: session.user.id }, select: { name: true } }),
    ]);
    const typedAudience = audience as { id: string; role: "STUDENT" | "TEACHER" }[];
    if (typedAudience.length > 0) {
      await notifyCourseAudience({
        audience: typedAudience,
        title: `新资源：《${safeName}》`,
        body: `课程《${course.title}》 · ${uploader?.name ?? "教师"} 上传`,
        hrefStudent: `/courses/${courseId}/resources`,
        hrefTeacher: `/t/courses/${courseId}/resources`,
        courseId,
      });
    }
  } catch {
    // 通知失败不影响上传
  }

  return NextResponse.json({ ok: true, resource });
}
