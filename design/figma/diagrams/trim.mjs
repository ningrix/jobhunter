// SVG 自动裁边：去掉四周空白，让小字号图在论文页面里显示得更大。
// node design/figma/diagrams/trim.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'out');
const PAD = 26; // 留白，避免裁掉投影

function bboxOf(svg) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const add = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  };

  // rect
  for (const m of svg.matchAll(/<rect[^>]*\bx="([\d.-]+)"[^>]*\by="([\d.-]+)"[^>]*\bwidth="([\d.-]+)"[^>]*\bheight="([\d.-]+)"/g)) {
    const [x, y, w, h] = m.slice(1).map(Number);
    add(x, y); add(x + w, y + h);
  }
  // circle / ellipse
  for (const m of svg.matchAll(/<circle[^>]*\bcx="([\d.-]+)"[^>]*\bcy="([\d.-]+)"[^>]*\br="([\d.-]+)"/g)) {
    const [cx, cy, r] = m.slice(1).map(Number);
    add(cx - r, cy - r); add(cx + r, cy + r);
  }
  for (const m of svg.matchAll(/<ellipse[^>]*\bcx="([\d.-]+)"[^>]*\bcy="([\d.-]+)"[^>]*\brx="([\d.-]+)"[^>]*\bry="([\d.-]+)"/g)) {
    const [cx, cy, rx, ry] = m.slice(1).map(Number);
    add(cx - rx, cy - ry); add(cx + rx, cy + ry);
  }
  // line
  for (const m of svg.matchAll(/<line[^>]*\bx1="([\d.-]+)"[^>]*\by1="([\d.-]+)"[^>]*\bx2="([\d.-]+)"[^>]*\by2="([\d.-]+)"/g)) {
    const [x1, y1, x2, y2] = m.slice(1).map(Number);
    add(x1, y1); add(x2, y2);
  }
  // polygon points
  for (const m of svg.matchAll(/<polygon[^>]*\bpoints="([^"]+)"/g)) {
    for (const pair of m[1].trim().split(/\s+/)) {
      const [x, y] = pair.split(',').map(Number);
      add(x, y);
    }
  }
  // path d（取所有坐标对，保守估计）
  for (const m of svg.matchAll(/<path[^>]*\bd="([^"]+)"/g)) {
    const nums = m[1].match(/-?\d+(?:\.\d+)?/g) || [];
    for (let i = 0; i + 1 < nums.length; i += 2) add(Number(nums[i]), Number(nums[i + 1]));
  }
  // text（估算宽度不需要，取起点即可，文本本身在卡片内）
  for (const m of svg.matchAll(/<text[^>]*\bx="([\d.-]+)"[^>]*\by="([\d.-]+)"/g)) {
    add(Number(m[1]), Number(m[2]));
    add(Number(m[1]) + 110, Number(m[2]) + 16); // 保守右/下延伸
  }
  return { minX, minY, maxX, maxY };
}

let done = 0;
for (const f of readdirSync(dir).filter((n) => n.endsWith('.svg'))) {
  const file = join(dir, f);
  const svg = readFileSync(file, 'utf8');
  const head = svg.match(/<svg[^>]*width="(\d+)" height="(\d+)" viewBox="0 0 (\d+) (\d+)"/);
  if (!head) continue;
  const [W, H] = [Number(head[1]), Number(head[2])];
  const { minX, minY, maxX, maxY } = bboxOf(svg);
  if (!Number.isFinite(minX)) continue;

  const x0 = Math.max(0, Math.floor(minX - PAD));
  const y0 = Math.max(0, Math.floor(minY - PAD));
  const x1 = Math.min(W, Math.ceil(maxX + PAD));
  const y1 = Math.min(H, Math.ceil(maxY + PAD));
  const w = x1 - x0, h = y1 - y0;
  // 只在空白占比明显时才裁
  if (w > W * 0.97 && h > H * 0.97) continue;

  const out = svg.replace(
    /<svg[^>]*>/,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x0} ${y0} ${w} ${h}">`,
  );
  writeFileSync(file, out);
  done++;
  console.log(`✓ ${f}  ${W}x${H} → ${w}x${h}  (${Math.round((1 - (w * h) / (W * H)) * 100)}% 空白裁掉)`);
}
console.log(`共裁剪 ${done} 张`);
