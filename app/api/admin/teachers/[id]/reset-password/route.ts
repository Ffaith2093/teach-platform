import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guard";

const schema = z.object({
  newPassword: z.string().min(1).max(64),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireRole(["ADMIN"]);
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "参数错误" }, { status: 400 });
  }
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.role !== "TEACHER") {
    return NextResponse.json({ message: "教师不存在" }, { status: 404 });
  }
  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({
    where: { id },
    data: { passwordHash, mustChangePassword: true, lastLoginAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}