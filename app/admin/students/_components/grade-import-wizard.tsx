"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Download, FileCheck2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  confirmGradeImportAction,
  previewGradeImportAction,
  type GradeImportState,
} from "@/app/admin/students/actions";

const initial: GradeImportState = { stage: "idle" };

export function GradeImportWizard({ gradeId, gradeName }: { gradeId: string; gradeName: string }) {
  const [previewState, previewAction, previewPending] = useActionState(previewGradeImportAction, initial);
  const [confirmState, confirmAction, confirmPending] = useActionState(confirmGradeImportAction, initial);
  const view = confirmState.stage !== "idle" ? confirmState : previewState;
  const pending = previewPending || confirmPending;

  if (view.stage === "idle" || view.stage === "error") {
    return (
      <form action={previewAction} className="space-y-4">
        <input type="hidden" name="gradeId" value={gradeId} />
        <label
          htmlFor="grade-import-file"
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/30 px-6 py-12 text-center transition-colors hover:border-primary hover:bg-primary-subtle/30"
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">选择全年级学生 Excel 或 CSV</p>
            <p className="mt-1 text-xs text-muted-foreground">每行填写班级、姓名、学号和邮箱，文件不超过 5MB</p>
          </div>
          <input id="grade-import-file" name="file" type="file" accept=".csv,.xlsx" className="hidden" required />
        </label>
        {view.stage === "error" && (
          <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-subtle/40 p-3 text-xs text-danger">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{view.message}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <GradeTemplateDownloadLink />
          <Button type="submit" disabled={pending}>{pending ? "解析中…" : "上传并预览"}</Button>
        </div>
      </form>
    );
  }

  if (view.stage === "preview") {
    const hasErrors = view.errors.length > 0;
    return (
      <div className="space-y-5">
        <div className={`rounded-lg border p-4 text-sm ${hasErrors ? "border-danger/30 bg-danger-subtle/30 text-danger" : "border-success/30 bg-success-subtle/30 text-success"}`}>
          <div className="flex items-center gap-2 font-medium">
            {hasErrors ? <AlertCircle className="h-4 w-4" /> : <FileCheck2 className="h-4 w-4" />}
            {hasErrors ? `发现 ${view.errors.length} 处错误，请修正后重新上传` : `解析完成，共 ${view.total} 条有效数据`}
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead><tr className="bg-muted/50 text-left text-xs text-muted-foreground"><th className="px-3 py-2">行</th><th className="px-3 py-2">班级</th><th className="px-3 py-2">姓名</th><th className="px-3 py-2">学号</th><th className="px-3 py-2">邮箱</th></tr></thead>
            <tbody className="divide-y divide-border">
              {view.sample.map((row) => <tr key={row.rowNo}><td className="px-3 py-2 num">{row.rowNo}</td><td className="px-3 py-2">{row.className}</td><td className="px-3 py-2">{row.name}</td><td className="px-3 py-2 font-mono text-xs">{row.studentNo}</td><td className="px-3 py-2 text-muted-foreground">{row.email ?? "—"}</td></tr>)}
            </tbody>
          </table>
        </div>

        {hasErrors && (
          <div className="max-h-72 overflow-auto rounded-lg border border-danger/30">
            <table className="w-full text-sm"><thead><tr className="bg-danger-subtle/30 text-left text-xs text-danger"><th className="px-3 py-2">行</th><th className="px-3 py-2">原始内容</th><th className="px-3 py-2">失败原因</th></tr></thead><tbody className="divide-y divide-danger/20">{view.errors.map((error) => <tr key={`${error.rowNo}-${error.reason}`}><td className="px-3 py-2 num">{error.rowNo}</td><td className="px-3 py-2 font-mono text-xs text-muted-foreground">{error.raw}</td><td className="px-3 py-2 text-danger">{error.reason}</td></tr>)}</tbody></table>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={() => window.location.reload()}>重新上传</Button>
          {!hasErrors && (
            <form action={confirmAction}>
              <input type="hidden" name="gradeId" value={gradeId} />
              <input type="hidden" name="fileBase64" value={view.fileBase64 ?? ""} />
              <Button type="submit" disabled={pending}>{pending ? "导入中…" : `确认导入 ${view.total} 名学生`}</Button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-success/30 bg-success-subtle/30 p-8 text-center">
      <CheckCircle2 className="h-10 w-10 text-success" />
      <p className="text-base font-semibold">已向{gradeName}导入 <span className="num">{view.created}</span> 名学生</p>
      <p className="text-xs text-muted-foreground">初始密码为学号后 6 位，学生首次登录后必须修改密码。</p>
      <Button asChild><a href={`/admin/students/${gradeId}`}>返回班级列表</a></Button>
    </div>
  );
}

function GradeTemplateDownloadLink() {
  function download() {
    const csv = "\uFEFF" + ["班级,姓名,学号,邮箱", "1班,张三,20260101,zhang@example.com", "2班,李四,20260201,"].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "全年级学生导入模板.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }
  return <button type="button" onClick={download} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"><Download className="h-3.5 w-3.5" />下载 CSV 模板</button>;
}
