import { AppError, ErrorCode } from "@/shared/errors";
import { defineRoute } from "@/lib/api";
import { ok } from "@/shared/response";
import { enqueueTask, runTaskAsync } from "@/server/ai/runner";
import { extractText, readUpload } from "@/server/core/file-parser";
import {
  getOriginalUploadVersion,
  getResumeFileInfo,
  markParseFailed,
} from "@/server/core/resume-service";

/** Stage B：重新解析——读回原始文件尽力提取文本并重提任务；失败保留文件与原因，不回滚 */
export const POST = defineRoute({ auth: true }, async ({ user, params }) => {
  const resumeId = params.id;
  const info = await getResumeFileInfo(user!.id, resumeId);
  if (!info) {
    throw new AppError(ErrorCode.VALIDATION, "该简历没有关联上传文件，无法重新解析");
  }
  const version = await getOriginalUploadVersion(user!.id, resumeId);
  try {
    const buf = await readUpload(info.filePath);
    const text = await extractText(info.fileName, info.mime, buf);
    if (!text.trim()) {
      throw new AppError(ErrorCode.FILE_PARSE_FAILED, "未能从文件提取到文本（可能是扫描件）");
    }
    const task = await enqueueTask(user!.id, "parse_resume", {
      text,
      resumeId,
      versionId: version.id,
    });
    runTaskAsync(task.id);
    return ok({ status: "pending", taskId: task.id });
  } catch (e) {
    const msg = e instanceof AppError ? e.message : `文件解析失败: ${String(e)}`;
    await markParseFailed(resumeId, version.id, msg);
    return ok({ status: "failed", error: msg });
  }
});
