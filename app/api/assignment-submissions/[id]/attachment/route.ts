import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveStoredPath } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const { id } = await params;
  const submission = await prisma.assignmentSubmission.findUnique({
    where: { id },
    select: {
      studentId: true,
      fileUrl: true,
      fileName: true,
      fileMimeType: true,
      assignment: { select: { courseId: true } },
    },
  });
  if (!submission?.fileUrl || !submission.fileName) return NextResponse.json({ message: "附件不存在" }, { status: 404 });

  let permitted = session.user.role === "ADMIN" || submission.studentId === session.user.id;
  if (!permitted && session.user.role === "TEACHER") {
    permitted = !!(await prisma.courseTeacher.findUnique({
      where: { courseId_teacherId: { courseId: submission.assignment.courseId, teacherId: session.user.id } },
    }));
  }
  if (!permitted) return NextResponse.json({ message: "无权下载" }, { status: 403 });

  let path: string;
  try {
    path = resolveStoredPath(submission.assignment.courseId, submission.fileUrl);
    await stat(path);
  } catch {
    return NextResponse.json({ message: "附件文件已丢失" }, { status: 410 });
  }
  const stream = Readable.toWeb(createReadStream(path)) as unknown as ReadableStream;
  const asciiName = submission.fileName.replace(/[^\x20-\x7E]|["\\]/g, "_") || "attachment";
  return new Response(stream, { headers: {
    "Content-Type": submission.fileMimeType || "application/octet-stream",
    "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(submission.fileName)}`,
    "Cache-Control": "private, no-store",
  } });
}
