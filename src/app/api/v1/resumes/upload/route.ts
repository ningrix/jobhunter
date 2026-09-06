import { AppError, ErrorCode } from "@/shared/errors";
import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { enqueueTask, runTaskAsync } from "@/server/ai/runner";
import {
  assertUploadType,
  extractText,
  MAX_UPLOAD_SIZE,
  saveUpload,
} from "@/server/core/file-parser";
import { markParseFailed, saveUploadRecord } from "@/server/core/resume-service";

/**
 * Stage B：文件为主的简历上传。
 * 先落盘文件并创建简历记录（parseStatus=pending），解析降级为尽力而为：
 * 提取失败只标记 failed（附原因），文件与简历保留，不再 400 打断。
 */
export const POST = defineRoute({ auth: true }, async ({ req, user }) => {
  const form = await req.formData().catch(() => null);
  if (!form) throw new AppError(ErrorCode.VALIDATION, "请使用 multipart/form-data 上传");
  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError(ErrorCode.VALIDATION, "缺少 file 字段");
  if (file.size > MAX_UPLOAD_SIZE) throw new AppError(ErrorCode.VALIDATION, "文件大小不能超过 5MB");
  if (file.size === 0) throw new AppError(ErrorCode.VALIDATION, "文件为空");
  assertUploadType(file.name, file.type);

  const buf = Buffer.from(await file.arrayBuffer());

  // 1) 文件 + 简历记录先落库（这是上传的主产物）
  const relPath = await saveUpload(file.name, buf);
  const { resume, version } = await saveUploadRecord(user!.id, {
    name: file.name,
    mime: file.type || "application/octet-stream",
    size: file.size,
    path: relPath,
  });

  // 2) 尽力而为的解析：失败不回滚，标记 failed 并保留原因
  let taskId: string | null = null;
  try {
    const text = await extractText(file.name, file.type, buf);
    if (text.trim()) {
      const task = await enqueueTask(user!.id, "parse_resume", {
        text,
        resumeId: resume.id,
        versionId: version.id,
      });
      runTaskAsync(task.id);
      taskId = task.id;
    } else {
      await markParseFailed(resume.id, version.id, "未能从文件提取到文本（可能是扫描件）");
    }
  } catch (e) {
    await markParseFailed(
      resume.id,
      version.id,
      e instanceof AppError ? e.message : `文件解析失败: ${String(e)}`,
    );
  }

  return ok({ resumeId: resume.id, taskId, parsed: taskId != null }, 202);
});
