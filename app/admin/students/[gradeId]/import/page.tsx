import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/shell/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { GradeImportWizard } from "../../_components/grade-import-wizard";

export const metadata = { title: "全年级批量导入学生" };

export default async function GradeImportPage({ params }: { params: Promise<{ gradeId: string }> }) {
  const { gradeId } = await params;
  const grade = await prisma.grade.findUnique({ where: { id: gradeId }, select: { id: true, name: true, isActive: true, _count: { select: { classes: true } } } });
  if (!grade) notFound();
  return <><Topbar crumbs={[{ label: "学生管理", href: "/admin/students" }, { label: grade.name, href: `/admin/students/${grade.id}` }, { label: "批量导入" }]} /><main className="flex-1 p-8"><div className="mx-auto flex max-w-[960px] flex-col gap-6"><div><Link href={`/admin/students/${grade.id}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ChevronLeft className="h-3 w-3" />返回班级列表</Link><h1 className="mt-2 text-2xl font-semibold tracking-tight">全年级批量导入学生</h1><p className="mt-1.5 text-sm text-muted-foreground">文件中的班级名必须与{grade.name}现有班级完全一致。</p></div><Card><CardContent className="p-6">{!grade.isActive ? <p className="text-sm text-warning">此年级已停用，暂不能导入学生。</p> : grade._count.classes === 0 ? <p className="text-sm text-warning">请先创建至少一个班级，再导入学生。</p> : <GradeImportWizard gradeId={grade.id} gradeName={grade.name} />}</CardContent></Card></div></main></>;
}
