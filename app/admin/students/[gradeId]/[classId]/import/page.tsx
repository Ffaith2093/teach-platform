import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Topbar } from "@/components/shell/topbar";
import { ChevronLeft, Upload, FileText } from "lucide-react";
import { ImportWizard } from "../../../_components/import-wizard";

export const metadata = { title: "批量导入学生" };

export default async function ImportPage({
  params,
}: {
  params: Promise<{ gradeId: string; classId: string }>;
}) {
  const { gradeId, classId } = await params;

  const cls = await prisma.class.findUnique({
    where: { id: classId },
    include: { grade: true },
  });
  if (!cls || cls.gradeId !== gradeId) notFound();

  return (
    <>
      <Topbar
        crumbs={[
          { label: "学生管理", href: "/admin/students" },
          { label: cls.grade.name, href: `/admin/students/${cls.gradeId}` },
          { label: cls.name, href: `/admin/students/${cls.gradeId}/${cls.id}` },
          { label: "批量导入" },
        ]}
      />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1024px] flex-col gap-6">
          <div>
            <Link
              href={`/admin/students/${cls.gradeId}/${cls.id}`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-3 w-3" />
              返回「{cls.name}」学生列表
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">批量导入学生</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              将 Excel / CSV 文件中的学生一次性导入到「
              <b className="text-foreground">
                {cls.grade.name} · {cls.name}
              </b>
              」。导入前会进行严格校验，任一行不合规即整体拒绝导入。
            </p>
          </div>

          <Card>
            <CardContent className="p-6">
              <ImportWizard classId={cls.id} className={cls.name} />
            </CardContent>
          </Card>

          <ImportRulesCard />
        </div>
      </main>
    </>
  );
}

function ImportRulesCard() {
  return (
    <Card>
      <CardContent className="space-y-3 p-6 text-sm">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <FileText className="h-3.5 w-3.5" />
          导入规则
        </div>
        <ul className="ml-1 space-y-2 text-xs text-muted-foreground">
          <li className="flex gap-2">
            <span className="text-primary">①</span>
            <span>
              文件第一列为<span className="font-medium text-foreground">姓名</span>，第二列为
              <span className="font-medium text-foreground">学号</span>（必须为 8 位数字），第三列为
              <span className="font-medium text-foreground">邮箱</span>（可空）。支持{" "}
              <code className="rounded bg-muted px-1 py-0.5">.csv</code> /{" "}
              <code className="rounded bg-muted px-1 py-0.5">.xlsx</code>，文件大小不超过 5MB。
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">②</span>
            <span>
              <span className="font-medium text-foreground">学号全校唯一</span>
              、邮箱若填写则全校唯一；
              <span className="font-medium text-foreground">任一行不合规即整体拒绝</span>
              ，不提供「跳过 / 覆盖」策略。
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">③</span>
            <span>
              邮箱留空将自动生成{" "}
              <code className="num rounded bg-muted px-1 py-0.5">学号@school.edu</code>。
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">④</span>
            <span>
              初始密码 = 学号后 6 位；学生首次登录将被强制跳转修改密码页。导入成功后请下载「初始密码
              CSV」分发给学生。
            </span>
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}
