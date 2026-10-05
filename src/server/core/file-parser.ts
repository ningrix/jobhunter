import path from "node:path";
import { AppError, ErrorCode } from "@/shared/errors";
import { getStorage, UPLOAD_KEY_PREFIX, UPLOAD_ROOT } from "@/server/storage";

export const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5MB
/** 兼容别名：物理根目录已移交存储抽象层（server/storage） */
export const UPLOAD_DIR = UPLOAD_ROOT;

/**
 * 服务端按扩展名推导 MIME：上传存储与下载响应都不信任客户端自报的 Content-Type。
 * 否则 text/html 等可被浏览器同源渲染的类型会经 /api/v1/files/[id] 造成存储型 XSS。
 */
const MIME_BY_EXT: Record<string, string> = {
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export function safeMimeFor(filename: string): string {
  const ext = (filename.toLowerCase().split(".").pop() ?? "").trim();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

/** 上传类型白名单预检：.doc 为老二进制格式无法解析，明确引导改存 docx/pdf */
export function assertUploadType(filename: string, mime: string): void {
  const ext = (filename.toLowerCase().split(".").pop() ?? "").trim();
  if (ext === "doc" || mime === "application/msword") {
    throw new AppError(
      ErrorCode.VALIDATION,
      "暂不支持老式 .doc：请在 Word 里「另存为 .docx」或导出 PDF 后再上传",
    );
  }
  const ok =
    ["txt", "md", "pdf", "docx"].includes(ext) ||
    mime.startsWith("text/") ||
    mime === "application/pdf" ||
    mime.includes("wordprocessingml");
  if (!ok) {
    throw new AppError(ErrorCode.VALIDATION, "不支持的文件类型，请上传 txt / md / pdf / docx");
  }
}

/** 解析 files.path → 绝对路径，并强制限定在 data/uploads 内（防目录穿越） */
export function resolveUploadPath(relPath: string): string {
  const abs = path.resolve(process.cwd(), relPath);
  const normalized = path.normalize(abs);
  if (normalized !== UPLOAD_ROOT && !normalized.startsWith(UPLOAD_ROOT + path.sep)) {
    throw new AppError(ErrorCode.FORBIDDEN, "非法文件路径");
  }
  return normalized;
}
/** 读取已保存的上传文件（owner 校验由调用方完成）；经存储抽象层，本地/云端同一路径 */
export async function readUpload(relPath: string): Promise<Buffer> {
  return getStorage().get(relPath);
}

/** 从上传文件提取纯文本（txt/md 直接读取，pdf/docx 走解析器） */
export async function extractText(filename: string, mime: string, buf: Buffer): Promise<string> {
  const ext = (filename.toLowerCase().split(".").pop() ?? "").trim();
  try {
    if (ext === "txt" || ext === "md" || mime.startsWith("text/")) {
      return buf.toString("utf8");
    }
    if (ext === "pdf" || mime === "application/pdf") {
      // 深度导入绕过 pdf-parse 入口的 debug 分支
      const mod = await import("pdf-parse/lib/pdf-parse.js");
      const pdfParse = ((mod as unknown as { default?: unknown }).default ?? mod) as (
        b: Buffer,
      ) => Promise<{ text: string }>;
      const out = await pdfParse(buf);
      if (!out.text?.trim()) throw new Error("PDF 中未提取到文本（可能是扫描件）");
      return out.text;
    }
    if (ext === "docx" || mime.includes("wordprocessingml")) {
      const mammoth = await import("mammoth");
      const out = await mammoth.extractRawText({ buffer: buf });
      return out.value;
    }
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(
      ErrorCode.FILE_PARSE_FAILED,
      `文件解析失败: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  throw new AppError(ErrorCode.VALIDATION, "不支持的文件类型，请上传 txt / md / pdf / docx");
}

export async function saveUpload(filename: string, buf: Buffer): Promise<string> {
  const ext = path.extname(filename).toLowerCase() || ".bin";
  const key = `${UPLOAD_KEY_PREFIX}${crypto.randomUUID()}${ext}`;
  await getStorage().put(key, buf);
  return key;
}
