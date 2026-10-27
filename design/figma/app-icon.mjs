/**
 * 应用图标（figma 管线的图标帧）：512×512 圆角方底 + 简历纸页 + 雷达弧。
 * 产出：design/figma/out/app-icon.svg 与 desktop/assets/icon.png（electron-builder 自动转 .ico）
 * 用法：node design/figma/app-icon.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");

export function buildIconSvg(size = 512) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3b82f6"/>
      <stop offset="1" stop-color="#1e40af"/>
    </linearGradient>
    <clipPath id="round">
      <rect x="0" y="0" width="512" height="512" rx="112"/>
    </clipPath>
  </defs>

  <g clip-path="url(#round)">
    <rect width="512" height="512" fill="url(#bg)"/>

    <!-- 简历纸页 -->
    <rect x="132" y="104" width="200" height="256" rx="18" fill="#ffffff" opacity="0.96"/>
    <rect x="164" y="150" width="136" height="18" rx="9" fill="#1e40af" opacity="0.9"/>
    <rect x="164" y="192" width="104" height="14" rx="7" fill="#93a7c8"/>
    <rect x="164" y="226" width="136" height="14" rx="7" fill="#93a7c8"/>
    <rect x="164" y="260" width="82" height="14" rx="7" fill="#93a7c8"/>

    <!-- 雷达弧（职位扫描） -->
    <g stroke="#ffffff" fill="none" stroke-linecap="round" opacity="0.95">
      <path d="M300 344 A 104 104 0 0 1 404 240" stroke-width="14"/>
      <path d="M300 344 A 68 68 0 0 1 368 276" stroke-width="12" opacity="0.75"/>
      <path d="M300 344 A 34 34 0 0 1 334 310" stroke-width="10" opacity="0.55"/>
    </g>
    <circle cx="300" cy="344" r="13" fill="#ffffff"/>
  </g>
</svg>`;
}

function main() {
  const svg = buildIconSvg(512);
  const outDir = path.join(HERE, "out");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "app-icon.svg"), svg);

  const png = new Resvg(svg, { fitTo: { mode: "width", value: 512 } }).render().asPng();
  const assetsDir = path.join(ROOT, "desktop", "assets");
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.writeFileSync(path.join(assetsDir, "icon.png"), png);

  console.log(`[icon] ✓ ${path.join(outDir, "app-icon.svg")}`);
  console.log(`[icon] ✓ ${path.join(assetsDir, "icon.png")} (${(png.length / 1024).toFixed(1)} KB)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
