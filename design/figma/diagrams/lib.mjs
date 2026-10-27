// 论文配图原语库 · 现代产品风
// 白底 + 渐变卡片 + 柔和投影 + 大圆角；彩色但靠明度分层，灰度打印仍可辨。
// 字体用微软雅黑，保证 resvg 转 PNG 时中文可渲染。

export const FONT = "'Microsoft YaHei','PingFang SC',sans-serif";

// ———— 色板 ————
const INK = '#0F172A';       // 标题
const TEXT = '#334155';      // 正文
const MUTED = '#64748B';     // 次要
const BORDER = '#CBD5E1';
const LINE = '#94A3B8';
const WHITE = '#FFFFFF';

const C = {
  blue: '#2563EB', blueD: '#1E40AF', blueL: '#EFF6FF',
  cyan: '#0891B2', cyanL: '#ECFEFF',
  violet: '#7C3AED', violetL: '#F5F3FF',
  amber: '#D97706', amberL: '#FFFBEB',
  green: '#059669', greenL: '#ECFDF5',
  red: '#DC2626', redL: '#FEF2F2',
  slate: '#475569', slateL: '#F1F5F9',
};

export const r2 = (n) => Math.round(n * 100) / 100;
export const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function textW(s, size) {
  let w = 0;
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (c > 0x2e7f) w += size;
    else if (/[0-9]/.test(ch)) w += size * 0.58;
    else if (/[A-Z]/.test(ch)) w += size * 0.64;
    else if (/[a-z]/.test(ch)) w += size * 0.53;
    else if (ch === ' ') w += size * 0.28;
    else w += size * 0.5;
  }
  return w;
}

// ———— 文本 ————
export function txt(x, y, s, o = {}) {
  const size = o.size || 14;
  return (
    `<text x="${r2(x)}" y="${r2(y)}" font-family="${FONT}" font-size="${size}"` +
    (o.weight ? ` font-weight="${o.weight}"` : '') +
    ` fill="${o.fill || INK}"` +
    (o.anchor ? ` text-anchor="${o.anchor}"` : '') +
    `>${esc(s)}</text>`
  );
}
export const ctxt = (cx, cy, s, o = {}) =>
  txt(cx, cy + (o.size || 14) * 0.34, s, { anchor: 'middle', ...o });

export function mtxt(cx, cy, lines, o = {}) {
  const size = o.size || 14;
  const lh = o.lh || size * 1.46;
  const y0 = cy - ((lines.length - 1) * lh) / 2 + size * 0.34;
  const opts = { anchor: 'middle', ...o };
  return lines.map((s, i) => txt(cx, y0 + i * lh, s, opts)).join('');
}

// ———— 画布与 defs（渐变 + 投影） ————
export const svgWrap = (w, h, inner) => {
  const defs = [
    `<linearGradient id="gBlue" x1="0" y1="0" x2="1" y2="1">
       <stop offset="0%" stop-color="#3B82F6"/><stop offset="100%" stop-color="#1E40AF"/></linearGradient>`,
    `<linearGradient id="gAmber" x1="0" y1="0" x2="1" y2="1">
       <stop offset="0%" stop-color="#F59E0B"/><stop offset="100%" stop-color="#D97706"/></linearGradient>`,
    `<linearGradient id="gGreen" x1="0" y1="0" x2="1" y2="1">
       <stop offset="0%" stop-color="#10B981"/><stop offset="100%" stop-color="#059669"/></linearGradient>`,
    `<linearGradient id="gViolet" x1="0" y1="0" x2="1" y2="1">
       <stop offset="0%" stop-color="#8B5CF6"/><stop offset="100%" stop-color="#6D28D9"/></linearGradient>`,
    `<linearGradient id="gSoft" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0%" stop-color="#F8FAFC"/><stop offset="100%" stop-color="#EEF2F7"/></linearGradient>`,
    `<linearGradient id="gBlueSoft" x1="0" y1="0" x2="1" y2="1">
       <stop offset="0%" stop-color="#EFF6FF"/><stop offset="100%" stop-color="#DBEAFE"/></linearGradient>`,
    `<filter id="sh" x="-30%" y="-30%" width="160%" height="160%">
       <feDropShadow dx="0" dy="2.5" stdDeviation="3.2" flood-color="#0F172A" flood-opacity="0.13"/></filter>`,
    `<filter id="shSoft" x="-30%" y="-30%" width="160%" height="160%">
       <feDropShadow dx="0" dy="1.5" stdDeviation="2" flood-color="#0F172A" flood-opacity="0.08"/></filter>`,
    `<marker id="arw" viewBox="0 0 10 10" refX="9.2" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
       <path d="M1,1 L9.4,5 L1,9 z" fill="${LINE}"/></marker>`,
  ].join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs>${defs}</defs>` +
    `<rect width="${w}" height="${h}" fill="#FFFFFF"/>${inner}</svg>`;
};

// ———— 基础图形 ————
export const rect = (x, y, w, h, o = {}) =>
  `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}"` +
  ` fill="${o.fill || WHITE}"` +
  ` rx="${o.rx != null ? o.rx : 12}"` +
  (o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw || 1.5}"` : '') +
  (o.filter ? ` filter="url(#${o.filter})"` : '') +
  (o.dash ? ` stroke-dasharray="${o.dash}"` : '') +
  (o.opacity != null ? ` opacity="${o.opacity}"` : '') +
  `/>`;

export const line = (x1, y1, x2, y2, o = {}) =>
  `<line x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}"` +
  ` stroke="${o.stroke || LINE}" stroke-width="${o.sw || 1.6}"` +
  (o.dash ? ` stroke-dasharray="${o.dash}"` : '') +
  `/>`;

export const circle = (cx, cy, rr, fill, o = {}) =>
  `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(rr)}" fill="${fill}"` +
  (o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw || 1.5}"` : '') +
  (o.opacity != null ? ` opacity="${o.opacity}"` : '') +
  `/>`;

/** 左侧色条（贴在卡片内侧） */
function accentBar(x, y, w, h, color, rx = 12) {
  const inset = 5;
  return `<rect x="${r2(x + inset)}" y="${r2(y + inset + 4)}" width="4" height="${r2(h - (inset + 4) * 2)}" rx="2" fill="${color}"/>`;
}

/** 流程框：白底圆角卡 + 左侧色条 + 柔和投影 + 居中多行文字 */
export function proc(cx, cy, w, h, lines, o = {}) {
  const arr = Array.isArray(lines) ? lines : [lines];
  const x = cx - w / 2, y = cy - h / 2;
  const accent = o.accent || C.blue;
  return (
    rect(x, y, w, h, { rx: o.rx ?? 12, fill: o.fill || WHITE, stroke: o.stroke || BORDER, sw: o.sw || 1.5, filter: o.filter ?? 'sh', dash: o.dash }) +
    accentBar(x, y, w, h, accent, o.rx ?? 12) +
    mtxt(cx + 3, cy, arr, { size: o.size || 14, fill: o.textFill || INK, weight: o.weight })
  );
}

/** 起止框：渐变胶囊（白字，宽度按文字自适应） */
export const stadium = (cx, cy, w, h, label, o = {}) => {
  const arr = Array.isArray(label) ? label : [label];
  const size = o.size || 14.5;
  const need = Math.max(...arr.map((s) => textW(s, size))) + 60;
  const ww = Math.max(w, need);
  return `<g filter="url(#sh)"><rect x="${r2(cx - ww / 2)}" y="${r2(cy - h / 2)}" width="${r2(ww)}" height="${r2(h)}"` +
    ` rx="${h / 2}" fill="url(#${o.grad || 'gBlue'})"/></g>` +
    mtxt(cx, cy, arr, { size, fill: '#FFFFFF', weight: 600 });
};

/** 判断框：琥珀渐变菱形 + 白字 */
export function diamond(cx, cy, w, h, lines, o = {}) {
  const arr = Array.isArray(lines) ? lines : [lines];
  const pts = [
    [cx, cy - h / 2], [cx + w / 2, cy], [cx, cy + h / 2], [cx - w / 2, cy],
  ].map((p) => p.map(r2).join(',')).join(' ');
  return (
    `<g filter="url(#sh)"><polygon points="${pts}" fill="url(#${o.grad || 'gAmber'})"/></g>` +
    mtxt(cx, cy, arr, { size: o.size || 13.5, fill: '#FFFFFF', weight: 600 })
  );
}

/** 折线箭头 */
export function flowArrow(points, o = {}) {
  if (points.length < 2) return '';
  const end = points[points.length - 1];
  const pre = points[points.length - 2];
  const dx = end[0] - pre[0], dy = end[1] - pre[1];
  const len = Math.hypot(dx, dy) || 1;
  const ex = end[0] - (dx / len) * 3, ey = end[1] - (dy / len) * 3;
  const d = `M ${r2(points[0][0])} ${r2(points[0][1])} ` +
    points.slice(1, -1).map((p) => `L ${r2(p[0])} ${r2(p[1])} `).join('') +
    `L ${r2(ex)} ${r2(ey)}`;
  return (
    `<path d="${d}" fill="none" stroke="${o.stroke || LINE}" stroke-width="${o.sw || 1.7}"` +
    (o.dash ? ` stroke-dasharray="${o.dash}"` : '') +
    ` marker-end="url(#arw)"/>` +
    (o.label
      ? `<rect x="${r2((o.lx ?? (points[0][0] + end[0]) / 2) - 13)}" y="${r2((o.ly ?? (points[0][1] + end[1]) / 2) - 12)}" width="26" height="22" rx="7" fill="#FFFFFF" opacity="0.92"/>` +
        ctxt(o.lx ?? (points[0][0] + end[0]) / 2, o.ly ?? (points[0][1] + end[1]) / 2, o.label, { size: 12.5, fill: C.slate, weight: 600 })
      : '')
  );
}

/** 用例图：角色卡片 */
export function actor(cx, cy, label, o = {}) {
  const s = o.size || 1;
  const body = (
    `<circle cx="${cx}" cy="${cy - 34 * s}" r="${9 * s}" fill="url(#gBlue)"/>` +
    `<line x1="${cx}" y1="${cy - 25 * s}" x2="${cx}" y2="${cy + 2 * s}" stroke="${C.blueD}" stroke-width="2.2" stroke-linecap="round"/>` +
    `<line x1="${cx - 13 * s}" y1="${cy - 14 * s}" x2="${cx + 13 * s}" y2="${cy - 14 * s}" stroke="${C.blueD}" stroke-width="2.2" stroke-linecap="round"/>` +
    `<line x1="${cx}" y1="${cy + 2 * s}" x2="${cx - 11 * s}" y2="${cy + 20 * s}" stroke="${C.blueD}" stroke-width="2.2" stroke-linecap="round"/>` +
    `<line x1="${cx}" y1="${cy + 2 * s}" x2="${cx + 11 * s}" y2="${cy + 20 * s}" stroke="${C.blueD}" stroke-width="2.2" stroke-linecap="round"/>`
  );
  return body + ctxt(cx, cy + 34 * s, label, { size: 14.5, weight: 700, fill: INK });
}

/** 用例：白底胶囊 + 左侧渐变点 */
export function usecase(cx, cy, w, h, lines, o = {}) {
  const arr = Array.isArray(lines) ? lines : [lines];
  const x = cx - w / 2, y = cy - h / 2;
  return (
    rect(x, y, w, h, { rx: h / 2, fill: WHITE, stroke: '#BFDBFE', sw: 1.8, filter: 'sh' }) +
    `<circle cx="${x + 22}" cy="${cy}" r="5.5" fill="url(#gBlue)"/>` +
    mtxt(cx + 10, cy, arr, { size: o.size || 13.5, fill: INK, weight: 600 })
  );
}

/** ER 实体：白底圆角 + 左侧粗色条 + 标题 */
export function entity(cx, cy, w, h, label, o = {}) {
  const x = cx - w / 2, y = cy - h / 2;
  return (
    `<g filter="url(#sh)">${rect(x, y, w, h, { rx: 14, fill: WHITE, stroke: '#BFDBFE', sw: 1.8 })}</g>` +
    accentBar(x, y, w, h, C.blue, 14) +
    ctxt(cx + 3, cy, label, { size: o.size || 15, weight: 700, fill: INK })
  );
}

/** ER 属性：白底胶囊 */
export function attr(cx, cy, w, h, label, o = {}) {
  return (
    rect(cx - w / 2, cy - h / 2, w, h, { rx: h / 2, fill: WHITE, stroke: '#E2E8F0', sw: 1.4, filter: 'shSoft' }) +
    ctxt(cx, cy, label, { size: o.size || 12.5, fill: TEXT })
  );
}

/** ER 关系：紫色渐变菱形 + 白字 */
export function rel(cx, cy, w, h, label) {
  return diamond(cx, cy, w, h, label, { grad: 'gViolet', size: 13 });
}

export const link = (x1, y1, x2, y2, o = {}) =>
  `<line x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}"` +
  ` stroke="${o.stroke || LINE}" stroke-width="${o.sw || 1.5}"` +
  (o.arrow ? ` marker-end="url(#arw)"` : '') +
  `/>`;

/** 功能结构节点：白底卡 + 顶部渐变条 */
export function fnode(cx, cy, w, h, label, o = {}) {
  const x = cx - w / 2, y = cy - h / 2;
  const grad = o.grad || 'gBlue';
  const arr = Array.isArray(label) ? label : [label];
  return (
    `<g filter="url(#sh)">${rect(x, y, w, h, { rx: 10, fill: WHITE, stroke: '#E2E8F0', sw: 1.5 })}</g>` +
    `<rect x="${r2(x + 12)}" y="${r2(y)}" width="${r2(w - 24)}" height="6" rx="3" fill="url(#${grad})"/>` +
    mtxt(cx, cy + 3, arr, { size: o.size || 13.5, fill: INK, weight: 600 })
  );
}

/** 架构层容器：浅渐变底 + 虚线边框 + 标题 */
export function layerBox(x, y, w, h, title, o = {}) {
  return (
    rect(x, y, w, h, { rx: 16, fill: 'url(#gSoft)', stroke: '#CBD5E1', sw: 1.6, dash: o.dash ?? '7 5', filter: 'shSoft' }) +
    rect(x + 18, y + 14, Math.min(w - 36, 8 + textW(title, 15.5) + 24), 30, { rx: 8, fill: 'url(#gBlue)', stroke: 'none' }) +
    txt(x + 30, y + 35, title, { size: 15.5, weight: 700, fill: '#FFFFFF' }) +
    (o.subtitle ? txt(x + 20, y + 62, o.subtitle, { size: 12, fill: MUTED }) : '')
  );
}

/** 小标签（用于图内注释） */
export const pill = (cx, cy, label, o = {}) => {
  const w = textW(label, o.size || 12) + 22;
  return rect(cx - w / 2, cy - 12, w, 24, { rx: 12, fill: o.fill || C.slateL, stroke: 'none' }) +
    ctxt(cx, cy, label, { size: o.size || 12, fill: o.textFill || C.slate, weight: 600 });
};

export const COLORS = C;
export const INK_C = INK;
export const TEXT_C = TEXT;
export const MUTED_C = MUTED;
export const LINE_C = LINE;
export const BORDER_C = BORDER;
