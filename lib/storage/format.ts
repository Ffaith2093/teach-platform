/**
 * 资源相关纯函数（client-safe）。不要在此引入 node:* 模块，避免 webpack 把 node 模块塞进客户端 bundle。
 */

/** 允许的文件扩展名（小写） + 默认 MIME */
export const EXT_WHITELIST: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip",
  py: "text/x-python",
  ipynb: "application/json",
  md: "text/markdown",
  txt: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  mp4: "video/mp4",
};

/** 文件大小 → 人类可读 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** 按扩展名给个图标名（对应 lucide-react 的组件名） */
export function iconForExt(ext: string): string {
  const e = ext.toLowerCase();
  if (e === "pdf") return "FileText";
  if (["docx", "txt", "md"].includes(e)) return "FileText";
  if (["pptx"].includes(e)) return "Presentation";
  if (["xlsx"].includes(e)) return "Sheet";
  if (["png", "jpg", "jpeg"].includes(e)) return "Image";
  if (["mp4"].includes(e)) return "Video";
  if (["zip"].includes(e)) return "Archive";
  if (["py", "ipynb"].includes(e)) return "Code2";
  return "File";
}
