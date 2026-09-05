import fs from "node:fs/promises";
import path from "node:path";
import { AppError, ErrorCode } from "@/shared/errors";

export const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5MB
export const UPLOAD_DIR = path.resolve(process.cwd(), "data", "uploads");

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
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const ext = path.extname(filename).toLowerCase() || ".bin";
  const rel = path.join("data", "uploads", `${crypto.randomUUID()}${ext}`);
  await fs.writeFile(path.resolve(process.cwd(), rel), buf);
  return rel.replace(/\\/g, "/");
}
