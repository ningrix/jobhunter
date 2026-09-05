// JobHunter 概念稿 · SVG 组件库（几何/文本/图标/控件/图表/应用壳）
import { FONT } from './tokens.mjs';

export const r = (n) => Math.round(n * 100) / 100;
export const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// —— 文本宽度估算（CJK≈1em，数字/字母按比例）——
export function textW(s, size) {
  let w = 0;
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (c > 0x2e7f) w += size; // CJK & 全角
    else if (/[0-9]/.test(ch)) w += size * 0.58;
    else if (/[A-Z]/.test(ch)) w += size * 0.64;
    else if (/[a-z]/.test(ch)) w += size * 0.53;
    else if (ch === ' ') w += size * 0.28;
    else if (/[.,:;'|!()\[\]]/.test(ch)) w += size * 0.3;
    else w += size * 0.5;
  }
  return w;
}
export function fit(s, maxW, size) {
  s = String(s);
  if (textW(s, size) <= maxW) return s;
  let out = s;
  while (out.length > 1 && textW(out + '…', size) > maxW) out = out.slice(0, -1);
  return out + '…';
}

// —— 文本（y 为基线）；ctxt 垂直居中于 cy ——
export function txt(x, y, s, o = {}) {
  const size = o.size || 13;
  return (
    `<text x="${r(x)}" y="${r(y)}" font-family="${FONT}" font-size="${size}"` +
    (o.weight ? ` font-weight="${o.weight}"` : '') +
    ` fill="${o.fill}"` +
    (o.anchor ? ` text-anchor="${o.anchor}"` : '') +
    (o.ls ? ` letter-spacing="${o.ls}"` : '') +
    `>${esc(s)}</text>`
  );
}
export const ctxt = (cx, cy, s, o = {}) =>
  txt(cx, cy + (o.size || 13) * 0.34, s, { anchor: 'middle', ...o });

// —— 基础图形 ——
export const rect = (x, y, w, h, fill, o = {}) =>
  `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" fill="${fill}"` +
  (o.rx ? ` rx="${o.rx}"` : '') +
  (o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw || 1}"` : '') +
  (o.opacity != null ? ` opacity="${o.opacity}"` : '') +
  `/>`;
export const line = (x1, y1, x2, y2, stroke, w = 1, o = {}) =>
  `<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" stroke="${stroke}" stroke-width="${w}"` +
  (o.cap ? ` stroke-linecap="${o.cap}"` : '') +
  (o.dash ? ` stroke-dasharray="${o.dash}"` : '') +
  `/>`;
export const card = (t, x, y, w, h, o = {}) =>
  rect(x, y, w, h, o.fill || t.surface, {
    rx: o.rx ?? 16,
    stroke: o.stroke ?? t.border,
    sw: o.sw ?? 1,
  });
export const circle = (cx, cy, rr, fill, o = {}) =>
  `<circle cx="${r(cx)}" cy="${r(cy)}" r="${r(rr)}" fill="${fill}"` +
  (o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw || 1}"` : '') +
  (o.opacity != null ? ` opacity="${o.opacity}"` : '') +
  `/>`;

// —— 图标（24 viewBox 线性风格，stroke 继承）——
const P = {
  dashboard:
    '<rect x="3.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.8"/>',
  doc: '<path d="M6.5 3.5h7.8L19 8.2V19.5a1.2 1.2 0 0 1-1.2 1.2H6.5a1.2 1.2 0 0 1-1.2-1.2V4.7a1.2 1.2 0 0 1 1.2-1.2z"/><path d="M14 3.8V8.5h4.7"/><path d="M8.6 12.5h6.8M8.6 16h4.6"/>',
  target:
    '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r="0.8" fill="currentColor" stroke="none"/>',
  kanban:
    '<rect x="3.5" y="4" width="5" height="16" rx="1.6"/><rect x="9.8" y="4" width="5" height="11" rx="1.6"/><rect x="16.1" y="4" width="4.4" height="14" rx="1.6"/>',
  bell: '<path d="M18.2 15.8H5.8l1.3-2.3c.5-.9.8-2 .8-3.1V9.4a4.1 4.1 0 0 1 8.2 0v1c0 1.1.3 2.2.8 3.1l1.3 2.3z"/><path d="M10.2 18.6a1.9 1.9 0 0 0 3.6 0"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M15.8 15.8 20 20"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  star: '<path d="M12 4.2l2.3 4.7 5.2.8-3.8 3.6.9 5.1L12 16l-4.6 2.4.9-5.1L4.5 9.7l5.2-.8L12 4.2z"/>',
  sparkle:
    '<path d="M12 3.5l1.9 5.4 5.4 1.9-5.4 1.9L12 18.1l-1.9-5.4-5.4-1.9 5.4-1.9L12 3.5z"/><path d="M18.8 15.6l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z"/>',
  clock: '<circle cx="12" cy="12" r="8.2"/><path d="M12 7.5V12l3 2.2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  chevronDown: '<path d="M6.5 9.5 12 15l5.5-5.5"/>',
  arrowRight: '<path d="M4.5 12h14M13.5 7l5 5-5 5"/>',
  upload: '<path d="M12 16V5M7.5 9 12 4.5 16.5 9"/><path d="M4.5 15.5v3A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5v-3"/>',
  trash: '<path d="M5 7h14M10 7V5.5A1.5 1.5 0 0 1 11.5 4h1A1.5 1.5 0 0 1 14 5.5V7M7 7l.8 12A1.5 1.5 0 0 0 9.3 20.4h5.4a1.5 1.5 0 0 0 1.5-1.4L17 7"/>',
  calendar:
    '<rect x="4" y="5.5" width="16" height="15" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  briefcase:
    '<rect x="3.5" y="7.5" width="17" height="12.5" rx="2"/><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3.5 12.5h17"/>',
  pin: '<path d="M12 21s-6.5-5.4-6.5-10.2a6.5 6.5 0 0 1 13 0C18.5 15.6 12 21 12 21z"/><circle cx="12" cy="10.6" r="2.2"/>',
  edit: '<path d="M14.5 5.5 18.5 9.5 8.5 19.5H4.5v-4L14.5 5.5z"/><path d="M12.8 7.2l4 4"/>',
  logout: '<path d="M14 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H14"/><path d="M10.5 12H20M16.8 8.2 20.5 12l-3.7 3.8"/>',
  filter: '<path d="M4.5 6h15M7.5 12h9M10.5 18h3"/>',
  user: '<circle cx="12" cy="8.2" r="3.7"/><path d="M4.8 20a7.6 7.6 0 0 1 14.4 0"/>',
  wallet: '<rect x="3.5" y="6.5" width="17" height="13" rx="2"/><path d="M3.5 10.5h17M16 15h1.5"/>',
  send: '<path d="M20 4.5 10.8 13.7M20 4.5l-5.8 15.2-3.4-6-6-3.4L20 4.5z"/>',
  trend: '<path d="M4 16.5 9.5 11l3.5 3.5L20 8"/><path d="M15.5 8H20v4.5"/>',
  download: '<path d="M12 5v11M7.5 11.5 12 16l4.5-4.5"/><path d="M4.5 19.5h15"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.6M12 17.9v2.6M3.5 12h2.6M17.9 12h2.6M6 6l1.9 1.9M16.1 16.1 18 18M18 6l-1.9 1.9M7.9 16.1 6 18"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4.5 7.5 12 13l7.5-5.5"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="9" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
};
export function icon(name, x, y, size, color, sw = 1.7) {
  const s = size / 24;
  return (
    `<g transform="translate(${r(x)} ${r(y)}) scale(${r(s)})" fill="none" stroke="${color}"` +
    ` stroke-width="${sw / s}" stroke-linecap="round" stroke-linejoin="round">${P[name]}</g>`
  );
}

// —— 控件 ——
export function chip(x, cy, label, o = {}) {
  const size = o.size || 11.5;
  const h = o.h || 22;
  const w = o.w || textW(label, size) + (o.padX ?? 9) * 2;
  const y = cy - h / 2;
  let s = rect(x, y, w, h, o.fill || t2(o).surface2, { rx: h / 2, stroke: o.stroke, sw: 1 });
  s += txt(x + w / 2, cy + size * 0.34, label, {
    size,
    weight: o.weight || 500,
    fill: o.textFill || t2(o).t2 || '#000',
    anchor: 'middle',
  });
  return { svg: s, w };
}
const t2 = (o) => o.t || {};
export const chipW = (label, size = 11.5, padX = 9) => textW(label, size) + padX * 2;

export function badge(x, cy, label, kind, t, o = {}) {
  const map = {
    success: { fill: t.successSoft, stroke: t.successBorder, textFill: t.success },
    warn: { fill: t.warnSoft, stroke: t.warnBorder, textFill: t.warn },
    danger: { fill: t.dangerSoft, stroke: t.dangerBorder, textFill: t.danger },
    primary: { fill: t.primarySoft, stroke: t.primarySoftBorder, textFill: t.primary },
    neutral: { fill: t.surface2, stroke: t.border, textFill: t.t2 },
  }[kind];
  return chip(x, cy, label, { t, size: o.size || 11.5, h: o.h || 22, weight: 600, ...map });
}

const btnW = (label, o) =>
  textW(label, 13.5) + (o.icon ? (o.iconSize || 16) + 8 : 0) + (o.padX ?? 18) * 2;

export function btnPrimary(x, cy, label, t, o = {}) {
  const h = o.h || 38;
  const w = o.w || btnW(label, o);
  const y = cy - h / 2;
  const gid = o.gid || 'gradBtn';
  let s =
    `<g><rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${h}" rx="${o.rx ?? 10}" fill="url(#${gid})"/>` +
    (o.icon ? icon(o.icon, x + 14, cy - (o.iconSize || 16) / 2, o.iconSize || 16, t.onPrimary, 1.8) : '');
  s += txt(
    x + w / 2 + (o.icon ? 8 : 0),
    cy + 13.5 * 0.34,
    label,
    { size: 13.5, weight: 600, fill: t.onPrimary, anchor: 'middle' }
  );
  return { svg: s + '</g>', w };
}
export function btnSoft(x, cy, label, t, o = {}) {
  const h = o.h || 38;
  const w = o.w || btnW(label, o);
  const y = cy - h / 2;
  let s = rect(x, y, w, h, t.primarySoft, { rx: o.rx ?? 10, stroke: t.primarySoftBorder });
  if (o.icon) s += icon(o.icon, x + 14, cy - 8, 16, t.primary, 1.8);
  s += txt(x + w / 2 + (o.icon ? 8 : 0), cy + 13.5 * 0.34, label, {
    size: 13.5,
    weight: 600,
    fill: t.primary,
    anchor: 'middle',
  });
  return { svg: s, w };
}
export function btnOutline(x, cy, label, t, o = {}) {
  const h = o.h || 38;
  const w = o.w || btnW(label, o);
  const y = cy - h / 2;
  const col = o.color || t.t2;
  let s = rect(x, y, w, h, o.fill || t.surface, { rx: o.rx ?? 10, stroke: t.borderStrong });
  if (o.icon) s += icon(o.icon, x + 14, cy - 8, 16, col, 1.8);
  s += txt(x + w / 2 + (o.icon ? 8 : 0), cy + 13.5 * 0.34, label, {
    size: 13.5,
    weight: 600,
    fill: col,
    anchor: 'middle',
  });
  return { svg: s, w };
}
export function inputBox(x, cy, w, placeholder, t, o = {}) {
  const h = o.h || 40;
  const y = cy - h / 2;
  let s = rect(x, y, w, h, o.fill || t.surface, { rx: o.rx ?? 10, stroke: o.stroke || t.borderStrong });
  let tx = x + 14;
  if (o.icon) {
    s += icon(o.icon, x + 13, cy - 8, 16, t.t3);
    tx = x + 38;
  }
  const label = o.value ?? placeholder;
  s += txt(tx, cy + 13 * 0.34, label, {
    size: 13,
    fill: o.value != null ? (o.valueFill || t.t1) : t.t3,
    weight: o.value != null ? 500 : 400,
  });
  if (o.suffix) {
    s += icon('chevronDown', x + w - 24, cy - 8, 16, t.t3);
  }
  return { svg: s, w };
}
export function fieldBox(t, x, y, w, label, value, o = {}) {
  let s = txt(x, y + 10, label, { size: 11.5, weight: 500, fill: t.t3 });
  s += inputBox(x, y + 34, w, value, t, { h: 36, value, valueFill: t.t1 }).svg;
  return { svg: s, h: 62 };
}

export function starFilled(x, y, size, color) {
  const s = size / 24;
  return (
    `<g transform="translate(${r(x)} ${r(y)}) scale(${r(s)})">` +
    `<path d="M12 4.2l2.3 4.7 5.2.8-3.8 3.6.9 5.1L12 16l-4.6 2.4.9-5.1L4.5 9.7l5.2-.8L12 4.2z" fill="${color}"/></g>`
  );
}

export function avatar(cx, cy, rad, initials, t) {
  return (
    `<circle cx="${r(cx)}" cy="${r(cy)}" r="${r(rad)}" fill="url(#gradBtn)"/>` +
    ctxt(cx, cy + 0.5, initials, { size: rad * 0.95, weight: 700, fill: '#ffffff' })
  );
}

// —— 图表 ——
export function progressBar(x, cy, w, h, ratio, fill, t, o = {}) {
  const y = cy - h / 2;
  let s = rect(x, y, w, h, o.track || t.surface2, { rx: h / 2 });
  if (ratio > 0)
    s += rect(x, y, Math.max(w * ratio, h), h, fill, { rx: h / 2 });
  return s;
}
export function donutSegment(cx, cy, r1, r2, a0, a1, fill) {
  const pt = (rr, a) => [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = pt(r2, a0);
  const [x1, y1] = pt(r2, a1);
  const [x2, y2] = pt(r1, a1);
  const [x3, y3] = pt(r1, a0);
  return (
    `<path d="M${r(x0)} ${r(y0)} A${r2} ${r2} 0 ${large} 1 ${r(x1)} ${r(y1)}` +
    ` L${r(x2)} ${r(y2)} A${r1} ${r1} 0 ${large} 0 ${r(x3)} ${r(y3)} Z" fill="${fill}"/>`
  );
}
export function smoothPath(pts) {
  if (pts.length < 2) return '';
  let d = `M${r(pts[0][0])} ${r(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${r(c1[0])} ${r(c1[1])} ${r(c2[0])} ${r(c2[1])} ${r(p2[0])} ${r(p2[1])}`;
  }
  return d;
}

// —— 公共渐变 defs（每个框架都带）——
export function defs() {
  return `<defs>
<linearGradient id="gradBtn" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#8b5cf6"/>
</linearGradient>
<linearGradient id="gradBar" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#8b5cf6"/>
</linearGradient>
<linearGradient id="gradArea" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#818cf8" stop-opacity="0.32"/>
  <stop offset="1" stop-color="#818cf8" stop-opacity="0"/>
</linearGradient>
<linearGradient id="gradLogin" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#4338ca"/><stop offset="0.55" stop-color="#5b4fe8"/><stop offset="1" stop-color="#7c3aed"/>
</linearGradient>
<radialGradient id="glowA"><stop offset="0" stop-color="#6366f1" stop-opacity="0.5"/><stop offset="1" stop-color="#6366f1" stop-opacity="0"/></radialGradient>
<radialGradient id="glowB"><stop offset="0" stop-color="#8b5cf6" stop-opacity="0.4"/><stop offset="1" stop-color="#8b5cf6" stop-opacity="0"/></radialGradient>
</defs>`;
}

// —— 应用壳（侧边栏 + 内容坐标约定）——
export const NAV = [
  { key: 'dashboard', label: '仪表盘', icon: 'dashboard' },
  { key: 'resumes', label: '简历工作台', icon: 'doc' },
  { key: 'jobs', label: '职位中心', icon: 'target' },
  { key: 'applications', label: '投递看板', icon: 'kanban' },
  { key: 'reminders', label: '提醒', icon: 'bell' },
];
export const CONTENT_X = 232 + 32;

export function sidebar(t, active) {
  const w = 232;
  let s = rect(0, 0, w, 1024, t.surface, { stroke: null });
  s += line(w, 0, w, 1024, t.border, 1);
  // 品牌
  s += rect(20, 24, 34, 34, 'url(#gradBtn)', { rx: 10 });
  s += icon('target', 27, 31, 20, '#ffffff', 2);
  s += txt(64, 42, 'JobHunter', { size: 17, weight: 700, fill: t.t1 });
  s += txt(20, 78, 'AI 求职操作系统', { size: 11, fill: t.t3, ls: 1.5 });
  // 分区标签
  s += txt(20, 116, '工作台', { size: 10.5, weight: 600, fill: t.t3, ls: 3 });
  // 导航
  let y = 130;
  for (const item of NAV) {
    const act = item.key === active;
    if (act) {
      s += rect(12, y + 3, 208, 42, t.primarySoft, { rx: 11 });
      s += rect(12, y + 12, 3.5, 24, 'url(#gradBtn)', { rx: 2 });
    }
    s += icon(item.icon, 30, y + 14, 19, act ? t.primary : t.t3, act ? 1.9 : 1.7);
    s += txt(60, y + 26.5, item.label, {
      size: 13.5,
      weight: act ? 600 : 500,
      fill: act ? t.primary : t.t2,
    });
    y += 52;
  }
  // AI 用量卡
  const ay = 420;
  s += rect(16, ay, 200, 84, t.surface2, { rx: 14 });
  s += icon('sparkle', 30, ay + 14, 16, t.primary);
  s += txt(52, ay + 26, 'AI 用量（今日）', { size: 11.5, weight: 600, fill: t.t2 });
  s += txt(202, ay + 26, '34/200', { size: 11.5, weight: 600, fill: t.t2, anchor: 'end' });
  s += progressBar(30, ay + 52, 172, 6, 0.17, 'url(#gradBar)', t);
  s += txt(30, ay + 72, 'Mock Provider · 离线可用', { size: 10, fill: t.t3 });
  // 底部用户
  const uy = 936;
  s += line(20, uy - 20, 212, uy - 20, t.border, 1);
  s += avatar(42, uy + 12, 17, '李', t);
  s += txt(68, uy + 8, '李晓阳', { size: 12.5, weight: 600, fill: t.t1 });
  s += txt(68, uy + 26, fit('demo@jobhunter.cn', 110, 10.5), { size: 10.5, fill: t.t3 });
  s += icon('logout', 200, uy + 2, 17, t.t3);
  return s;
}

// 页面主标题行
export function pageHeader(t, x, cy, title, right = '', subtitle = '') {
  let s = txt(x, cy, title, { size: 23, weight: 700, fill: t.t1 });
  if (subtitle) s += txt(x, cy + 24, subtitle, { size: 12.5, fill: t.t3 });
  s += right;
  return s;
}
