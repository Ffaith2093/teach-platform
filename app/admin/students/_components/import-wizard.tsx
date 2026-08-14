"use client";

import * as React from "react";
import { useActionState } from "react";
import { Upload, FileCheck2, AlertCircle, Download, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { previewImportAction, confirmImportAction, type ImportState } from "@/app/admin/students/actions";

const initial: ImportState = { stage: "idle" };

interface CreatedRow {
  name: string;
  studentNo: string;
  password: string;
}

export function ImportWizard({ classId, className }: { classId: string; className: string }) {
  const [previewState, previewAction, previewPending] = useActionState(previewImportAction, initial);
  const [confirmState, confirmAction, confirmPending] = useActionState(confirmImportAction, initial);
  const [created, setCreated] = React.useState<CreatedRow[]>([]);

  // confirm 成功 → 触发密码 CSV 下载
  React.useEffect(() => {
    if (confirmState.stage === "done" && confirmState.created > 0 && created.length === 0) {
      // 这里只能拿到 created 数字，密码 CSV 通过「预览时缓存」补全
      // 简化处理：成功后 toast + 跳回班级页（页内已 revalidate）
    }
  }, [confirmState, created.length]);

  // 当前显示的 state：confirm 阶段优先
  const view = confirmState.stage !== "idle" ? confirmState : previewState;
  const pending = previewPending || confirmPending;

  function downloadPasswordsCsv(rows: CreatedRow[], filename: string) {
    const header = "姓名,学号,初始密码";
    const body = rows.map((r) => `${r.name},${r.studentNo},${r.password}`).join("\n");
    const csv = "\uFEFF" + [header, body].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // 上传阶段
  if (view.stage === "idle" || view.stage === "error") {
    return (
      <div className="space-y-4">
        <form action={previewAction} encType="multipart/form-data" className="space-y-4">
          <input type="hidden" name="classId" value={classId} />
          <label
            htmlFor="import-file"
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/30 px-6 py-12 text-center transition-colors hover:border-primary hover:bg-primary-subtle/30"
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">
                点击选择文件 / 拖入 Excel / CSV
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                支持 .csv / .xlsx / .xls · 文件 ≤ 5MB
              </p>
            </div>
            <input
              id="import-file"
              name="file"
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
            />
          </label>
          {view.stage === "error" && (
            <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-subtle/40 p-3 text-xs text-danger">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{view.message}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <TemplateDownloadLink />
            <Button type="submit" disabled={pending}>
              {pending ? "解析中…" : "上传并预览"}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  // 预览阶段（成功）
  if (view.stage === "preview") {
    const hasErrors = view.errors.length > 0;
    return (
      <div className="space-y-5">
        <div
          className={`rounded-lg border p-4 text-sm ${
            hasErrors
              ? "border-danger/30 bg-danger-subtle/30 text-danger"
              : "border-success/30 bg-success-subtle/30 text-success"
          }`}
        >
          <div className="flex items-center gap-2 font-medium">
            {hasErrors ? (
              <AlertCircle className="h-4 w-4" />
            ) : (
              <FileCheck2 className="h-4 w-4" />
            )}
            {hasErrors
              ? `解析完成，但发现 ${view.errors.length} 处错误，请修正后重新上传`
              : `解析完成，共 ${view.total} 条有效数据`}
          </div>
          <p className="mt-1 text-xs">
            {hasErrors
              ? "所有错误修正前无法继续。已选班级与文件状态已保留，修正文件后重新上传即可再次校验。"
              : "请确认下方预览信息无误后点击「确认导入」。"}
          </p>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            数据预览（前 5 行 · 共 {view.total} 行）
          </h3>
          <div className="mt-2 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                  <th className="px-3 py-2 w-12">#</th>
                  <th className="px-3 py-2">姓名</th>
                  <th className="px-3 py-2">学号</th>
                  <th className="px-3 py-2">邮箱</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {view.sample.map((row) => (
                  <tr key={row.rowNo}>
                    <td className="px-3 py-2 num text-xs text-muted-foreground">{row.rowNo}</td>
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2 num font-mono text-xs">{row.studentNo}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.email ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {hasErrors && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-danger">
              错误清单（{view.errors.length} 条）
            </h3>
            <div className="mt-2 overflow-hidden rounded-lg border border-danger/30">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-danger-subtle/30 text-left text-xs font-medium text-danger">
                    <th className="px-3 py-2 w-12">行号</th>
                    <th className="px-3 py-2">原始内容</th>
                    <th className="px-3 py-2">失败原因</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-danger/20">
                  {view.errors.map((e) => (
                    <tr key={e.rowNo}>
                      <td className="px-3 py-2 num text-xs">{e.rowNo}</td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                        {e.raw}
                      </td>
                      <td className="px-3 py-2 text-danger">{e.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {hasErrors ? (
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => window.location.reload()}>
              重新上传
            </Button>
          </div>
        ) : (
          <form action={confirmAction} className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <input type="hidden" name="classId" value={classId} />
            <input type="hidden" name="fileBase64" value={view.fileBase64 ?? ""} />
            <p className="text-xs text-muted-foreground">
              将向「{className}」导入 <b className="text-foreground num">{view.total}</b> 名学生
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => window.location.reload()}>
                重新上传
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "导入中…" : "确认导入"}
              </Button>
            </div>
          </form>
        )}
      </div>
    );
  }

  // 完成阶段
  if (view.stage === "done") {
    const createdCount = view.created;
    return (
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-3 rounded-lg border border-success/30 bg-success-subtle/30 p-8 text-center">
          <CheckCircle2 className="h-10 w-10 text-success" />
          <div>
            <p className="text-base font-semibold text-foreground">
              导入成功！共创建 <span className="num">{createdCount}</span> 名学生
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              学生初始密码 = 学号后 6 位，首次登录将强制跳转修改密码页。
            </p>
          </div>
          <div className="mt-2 flex gap-2">
            <Button asChild variant="outline">
              <a href={`/admin/students/${classId}`}>查看班级学生</a>
            </Button>
            <Button asChild variant="soft">
              <a href={`/admin/students`}>返回年级列表</a>
            </Button>
          </div>
        </div>
        <p className="rounded-lg bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
          提示：进入班级学生页可点击「下载密码 CSV」获取全部初始密码。
        </p>
      </div>
    );
  }

  return null;
}

function TemplateDownloadLink() {
  function download() {
    const csv =
      "\uFEFF" +
      ["姓名,学号,邮箱", "张三,20240101,zhangsan@school.edu", "李四,20240102,"].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "学生导入模板.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  return (
    <button
      type="button"
      onClick={download}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary"
    >
      <Download className="h-3.5 w-3.5" />
      下载 CSV 模板
    </button>
  );
}