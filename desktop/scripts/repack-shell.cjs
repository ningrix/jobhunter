/**
 * 只重打 Electron 外壳的 app.asar（改 main/wizard 后快速迭代用，不必整包重跑 electron-builder）。
 * 用法：node desktop/scripts/repack-shell.cjs [--unpacked release/win-unpacked]
 */
const fs = require("node:fs");
const path = require("node:path");
const asarMod = require("@electron/asar");
const asar = asarMod.default ?? asarMod;

const HERE = __dirname;
const DESKTOP = path.resolve(HERE, "..");

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : d;
};

const unpacked = path.resolve(arg("unpacked", path.join(DESKTOP, "release", "win-unpacked")));
const stage = path.join(DESKTOP, "build", "shell");
const out = path.join(unpacked, "resources", "app.asar");

fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
for (const item of ["main", "wizard", "assets", "preload.cjs", "package.json"]) {
  const from = path.join(DESKTOP, item);
  if (!fs.existsSync(from)) throw new Error(`缺少外壳文件：${item}`);
  fs.cpSync(from, path.join(stage, item), { recursive: true });
}

const pack = asar.createPackage ? asar : asar.default;
Promise.resolve(pack.createPackage(stage, out))
  .then(() => {
    const size = fs.statSync(out).size;
    console.log(`ASAR_REPACK_OK ${(size / 1024).toFixed(0)} KB → ${out}`);
  })
  .catch((e) => {
    console.error(`repack failed: ${e.message}`);
    process.exit(1);
  });
