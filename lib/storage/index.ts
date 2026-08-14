/**
 * 资源存储工具（SPEC §2.2）— 服务端
 *
 * 设计要点：
 * - 磁盘路径：<UPLOAD_DIR>/<courseId>/<uuid>.<ext>
 * - name（用户看到的）保留原文件名，storedName（磁盘名）是 UUID + ext（防路径穿越 / 冲突）
 * - 扩展名 + MIME 双重白名单校验（不能信客户端）
 *
 * 路径规范不暴露给前端：所有下载走 /api/resources/[id]/download 鉴权后流式返回。
 * 绝不配置 next.config 把 uploads/ 暴露成静态目录。
 */
import { mkdir, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";

// 引入并重导出 client-safe 的纯函数
import { EXT_WHITELIST, formatBytes, iconForExt } from "./format";
export { EXT_WHITELIST, formatBytes, iconForExt };

/** 默认硬上限（来自 SPEC §2.2） */
export const MAX_BYTES = 100 * 1024 * 1024; // 100MB

/** 解析 UPLOAD_DIR，启动时按需创建根目录 */
export function getUploadDir(): string {
  const dir = process.env.UPLOAD_DIR;
  if (!dir) throw new Error("UPLOAD_DIR is not set");
  return dir;
}

/**
 * 校验文件：扩展名 + MIME（双保险）。错误抛出给路由 handler。
 * - 原始文件名：用于展示
 * - MIME：客户端给的可能随便写，主要看扩展名推断
 */
export function validateUpload(
  originalName: string,
  declaredMime: string,
  sizeBytes: number,
): { ext: string; mime: string } {
  if (sizeBytes <= 0) throw new StorageError("文件为空");
  if (sizeBytes > MAX_BYTES) {
    throw new StorageError(`文件超过 ${MAX_BYTES / 1024 / 1024}MB 上限`);
  }

  const ext = extname(originalName).slice(1).toLowerCase();
  if (!ext) throw new StorageError("无法识别文件类型（无扩展名）");

  const expectedMime = EXT_WHITELIST[ext];
  if (!expectedMime) {
    throw new StorageError(`不支持的文件类型 .${ext}`);
  }

  // MIME 提示（不强制相等，但若客户端提供且跟白名单差异太大就拒）
  if (
    declaredMime &&
    declaredMime !== expectedMime &&
    !declaredMime.startsWith("application/octet-stream")
  ) {
    // 这里只对显著不一致（如 image/* 配 .pdf）做拒绝
    if (
      (expectedMime.startsWith("image/") && !declaredMime.startsWith("image/")) ||
      (expectedMime.startsWith("video/") && !declaredMime.startsWith("video/"))
    ) {
      throw new StorageError(`MIME 类型与扩展名不一致（${declaredMime} vs .${ext}）`);
    }
  }

  return { ext, mime: expectedMime };
}

/** 生成磁盘文件名：UUID + ext */
export function generateStoredName(ext: string): string {
  return `${randomUUID()}.${ext}`;
}

/** 解析 UPLOAD_DIR + courseId + storedName → 绝对路径 */
export function resolveStoredPath(courseId: string, storedName: string): string {
  // storedName 已经包含 ext；这里再做一次 double-check 防穿越
  if (storedName.includes("/") || storedName.includes("..") || storedName.startsWith(".")) {
    throw new StorageError("非法的存储文件名");
  }
  return join(getUploadDir(), courseId, storedName);
}

/** 启动时确保目录存在（幂等） */
export async function ensureStorageDir(): Promise<void> {
  const base = getUploadDir();
  await mkdir(base, { recursive: true });
}

/** 给一个 courseId 确保子目录存在 */
export async function ensureCourseDir(courseId: string): Promise<string> {
  await ensureStorageDir();
  const dir = join(getUploadDir(), courseId);
  await mkdir(dir, { recursive: true });
  await stat(dir); // sanity check
  return dir;
}

/** 校验 folder 字符串（防穿越） */
export function validateFolder(folder: string): string {
  if (!folder) return "/";
  if (folder.includes("..")) throw new StorageError("非法的目录路径");
  let f = folder.replace(/\\/g, "/");
  if (!f.startsWith("/")) f = "/" + f;
  f = f.replace(/\/+/g, "/");
  if (f.length > 1) f = f.replace(/\/+$/, "");
  return f || "/";
}

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}
