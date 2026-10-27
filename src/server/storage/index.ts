import fs from "node:fs/promises";
import path from "node:path";
import { AppError, ErrorCode } from "@/shared/errors";
import { DATA_ROOT } from "@/server/config/data-root";

/**
 * V4.0 存储抽象：业务代码只面向 StorageService，不感知物理介质。
 * 本地开发/测试 = LocalStorage（data/uploads，与既有 files.path 键格式完全兼容）；
 * 云端部署 = 换 STORAGE_DRIVER（oss/s3 驱动接入后），业务代码零改动。
 */

export interface StorageService {
  readonly driver: "local" | "oss";
  /** 写入对象。key 由服务端生成（含扩展名），必须落在授权前缀区内 */
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

/** 既定键格式：与历史 files.path 一致（data/uploads/<uuid><ext>），无需数据迁移 */
export const UPLOAD_KEY_PREFIX = "data/uploads/";
/** 物理根目录跟随数据根（桌面端 = %LOCALAPPDATA%\JobHunter\data\uploads） */
export const UPLOAD_ROOT = path.join(DATA_ROOT, "uploads");

export class LocalStorage implements StorageService {
  readonly driver = "local" as const;

  constructor(
    private readonly root: string = UPLOAD_ROOT,
    private readonly keyPrefix: string = UPLOAD_KEY_PREFIX,
  ) {}

  /** 键 → 绝对路径；强制限定在本驱动的根目录内（防目录穿越，承接原 file-parser 的硬ening） */
  resolve(key: string): string {
    if (!key.startsWith(this.keyPrefix)) {
      throw new AppError(ErrorCode.FORBIDDEN, "非法存储键");
    }
    const abs = path.resolve(this.root, key.slice(this.keyPrefix.length));
    const normalized = path.normalize(abs);
    if (normalized !== this.root && !normalized.startsWith(this.root + path.sep)) {
      throw new AppError(ErrorCode.FORBIDDEN, "非法存储键");
    }
    return normalized;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const abs = this.resolve(key);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, data);
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }
}

/** 云端驱动占位：接口先行，接入需对象存储 SDK + STS 凭据（NEEDS_VERIFICATION，V4.2 商业化阶段落地） */
export class OssStorage implements StorageService {
  readonly driver = "oss" as const;

  private unavailable(): never {
    throw new AppError(
      ErrorCode.INTERNAL,
      "OSS 存储驱动尚未接入：请设置 STORAGE_DRIVER=local，或等待 V4.2 云端部署阶段",
    );
  }

  async put(): Promise<void> {
    this.unavailable();
  }
  async get(): Promise<Buffer> {
    this.unavailable();
  }
  async delete(): Promise<void> {
    this.unavailable();
  }
}

/** 驱动选择：默认 local；业务代码永远不直接 new 驱动 */
export function getStorage(): StorageService {
  const name = (process.env.STORAGE_DRIVER ?? "local").trim().toLowerCase();
  if (name === "local") return new LocalStorage();
  if (name === "oss") return new OssStorage();
  throw new AppError(ErrorCode.VALIDATION, `未知 STORAGE_DRIVER: ${name}（可选 local / oss）`);
}
