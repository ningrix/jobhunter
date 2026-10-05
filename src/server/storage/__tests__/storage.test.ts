import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { LocalStorage, OssStorage, getStorage, UPLOAD_KEY_PREFIX } from "../index";
import { AppError } from "@/shared/errors";

let tmpRoot = "";
let storage: LocalStorage;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "jh-storage-"));
  storage = new LocalStorage(tmpRoot, UPLOAD_KEY_PREFIX);
});
afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe("LocalStorage", () => {
  it("put/get/delete 往返一致", async () => {
    const key = `${UPLOAD_KEY_PREFIX}test-uuid.pdf`;
    const buf = Buffer.from("%PDF-1.4 fake");
    await storage.put(key, buf);
    expect((await storage.get(key)).equals(buf)).toBe(true);
    await storage.delete(key);
    await expect(storage.get(key)).rejects.toThrow();
  });

  it("键必须落在授权前缀区内（防目录穿越）", async () => {
    await expect(storage.get("src/db/schema.ts")).rejects.toBeInstanceOf(AppError);
    await expect(storage.get("../secret.txt")).rejects.toBeInstanceOf(AppError);
    await expect(storage.get(`${UPLOAD_KEY_PREFIX}../../.env`)).rejects.toBeInstanceOf(AppError);
  });

  it("put 自动创建子目录", async () => {
    const key = `${UPLOAD_KEY_PREFIX}2026/09/xxx.docx`;
    await storage.put(key, Buffer.from("PK"));
    expect((await storage.get(key)).toString()).toBe("PK");
  });
});

describe("getStorage 驱动选择", () => {
  const original = process.env.STORAGE_DRIVER;
  afterEach(() => {
    if (original === undefined) delete process.env.STORAGE_DRIVER;
    else process.env.STORAGE_DRIVER = original;
  });

  it("默认 local", () => {
    delete process.env.STORAGE_DRIVER;
    expect(getStorage().driver).toBe("local");
  });

  it("oss 驱动可选，但操作明确报错（尚未接入）", async () => {
    process.env.STORAGE_DRIVER = "oss";
    const oss = getStorage();
    expect(oss).toBeInstanceOf(OssStorage);
    await expect(oss.put("x", Buffer.alloc(0))).rejects.toThrow(/尚未接入/);
  });

  it("未知驱动名直接拒绝（配置错误尽早暴露）", () => {
    process.env.STORAGE_DRIVER = "minio";
    expect(() => getStorage()).toThrow(/未知 STORAGE_DRIVER/);
  });
});
