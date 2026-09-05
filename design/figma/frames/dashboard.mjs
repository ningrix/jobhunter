// 仪表盘 · 统计卡 + 投递漏斗 + 趋势图 + 待办 + 阶段分布
import {
  rect, txt, ctxt, icon, card, circle, line, chip, badge, chipW,
  progressBar, donutSegment, smoothPath, sidebar, txt as T,
} from '../components.mjs';
import { CONTENT_X } from '../components.mjs';

export function dashboardFrame(t) {
  let s = rect(0, 0, 1440, 1024, t.bg);
  s += `<circle cx="1220" cy="-40" r="380" fill="url(#glowA)" opacity="${t.name === 'light' ? 0.5 : 0.7}"/>`;
  s += `<circle cx="380" cy="1080" r="380" fill="url(#glowB)" opacity="${t.name === 'light' ? 0.4 : 0.6}"/>`;
  s += sidebar(t, 'dashboard');

  // 标题行
  s += txt(CONTENT_X, 86, '仪表盘', { size: 23, weight: 700, fill: t.t1 });
  s += txt(1408, 86, '2026 年 8 月 30 日 · 星期日', { size: 12.5, fill: t.t3, anchor: 'end' });

  // —— 统计卡行 ——
  const stats = [
    ['doc', '简历', '6', ['+2 本周', 'success'], t.t1],
    ['target', '职位', '23', ['收藏 5', 'neutral'], t.t1],
    ['send', '投递总数', '18', ['+5 本周', 'success'], t.t1],
    ['bell', '待办提醒', '3', ['1 已到期', 'danger'], t.danger],
  ];
  stats.forEach(([ic, label, num, delta, numColor], i) => {
    const x = CONTENT_X + i * 291, y = 120, w = 271;
    s += card(t, x, y, w, 116);
    s += rect(x + 20, y + 20, 34, 34, t.primarySoft, { rx: 10 });
    s += icon(ic, x + 28, y + 28, 18, t.primary);
    s += txt(x + 64, y + 41, label, { size: 12.5, weight: 500, fill: t.t2 });
    const [dLabel, dKind] = delta;
    const dw = chipW(dLabel, 11) + 2;
    s += badge(x + w - 20 - dw, y + 37, dLabel, dKind, t, { size: 11, h: 21 }).svg;
    s += txt(x + 20, y + 92, num, { size: 28, weight: 700, fill: numColor });
  });

  // —— 投递漏斗（左上）——
  s += card(t, CONTENT_X, 264, 704, 300);
  s += txt(288, 307, '投递漏斗', { size: 15, weight: 700, fill: t.t1 });
  s += txt(944, 306, '全部投递 · 7 个阶段', { size: 11.5, fill: t.t3, anchor: 'end' });
  const funnel = [
    ['想投', 3, '#a5b4fc'], ['已投递', 5, 'grad'], ['笔试', 2, 'grad'],
    ['面试', 2, 'grad'], ['Offer', 1, 'grad'], ['已挂', 4, 'danger'], ['关闭', 1, 'off'],
  ];
  funnel.forEach(([name, n, color], i) => {
    const cy = 342 + i * 31;
    s += txt(288, cy + 4.5, name, { size: 12.5, weight: 500, fill: t.t2 });
    const fill = color === 'grad' ? 'url(#gradBar)' : color === 'danger' ? t.danger : color === 'off' ? t.surface3 : color;
    const op = color === 'danger' ? 0.75 : color === 'off' ? 0.9 : 1;
    s += `<g opacity="${op}">${progressBar(360, cy, 500, 10, n / 5, fill, t)}</g>`;
    s += txt(944, cy + 4.5, String(n), { size: 12.5, weight: 600, fill: t.t1, anchor: 'end' });
  });

  // —— 近 8 周趋势（左下）——
  s += card(t, CONTENT_X, 584, 704, 400);
  s += txt(288, 627, '近 8 周投递趋势', { size: 15, weight: 700, fill: t.t1 });
  s += rect(880, 613, 10, 10, 'url(#gradBar)', { rx: 3 });
  s += txt(944, 622, '投递数', { size: 11.5, fill: t.t2, anchor: 'end' });
  const vals = [1, 2, 2, 3, 2, 4, 3, 5];
  const weeks = ['07/06', '07/13', '07/20', '07/27', '08/03', '08/10', '08/17', '08/24'];
  const x0 = 300, x1 = 936, yBase = 912, unit = 50.4;
  for (let v = 0; v <= 5; v++) {
    const y = yBase - v * unit;
    s += line(x0, y, x1, y, t.border, 1, { dash: '3 5' });
    s += txt(288, y + 3.5, String(v), { size: 10, fill: t.t3, anchor: 'end' });
  }
  const pts = vals.map((v, i) => [x0 + (i * (x1 - x0)) / 7, yBase - v * unit]);
  const path = smoothPath(pts);
  s += `<path d="${path} L${x1} ${yBase} L${x0} ${yBase} Z" fill="url(#gradArea)"/>`;
  s += `<path d="${path}" fill="none" stroke="url(#gradBar)" stroke-width="2.5" stroke-linecap="round"/>`;
  pts.forEach(([px, py], i) => {
    if (i === pts.length - 1) {
      s += circle(px, py, 9, t.primary, { opacity: 0.18 });
      s += circle(px, py, 4.5, t.surface, { stroke: t.primary, sw: 2 });
      const cw = chipW('5 份', 11);
      s += chip(px - cw / 2, py - 24, '5 份', { t, fill: t.primary, textFill: '#ffffff', size: 11, h: 21 }).svg;
    } else {
      s += circle(px, py, 4, t.surface, { stroke: t.primary, sw: 2 });
    }
    s += txt(px, 944, weeks[i], { size: 10, fill: t.t3, anchor: 'middle' });
  });

  // —— 已到期待办（右上）——
  const RX = 1008, RW = 400;
  s += card(t, RX, 264, RW, 300);
  s += txt(1032, 307, '已到期待办', { size: 15, weight: 700, fill: t.t1 });
  s += badge(1032 + 92, 302, '3', 'danger', t, { size: 11.5, h: 22 }).svg;
  const todos = [
    ['准备字节跳动二面', '今天 14:30', true],
    ['跟进美团 HR 进度', '明天 10:00', false],
    ['修改简历后重新匹配', '9/2 09:00', false],
  ];
  todos.forEach(([title, time, overdue], i) => {
    const y = 330 + i * 70, h = 58;
    if (overdue) s += rect(1032, y, 372, h, t.dangerSoft, { rx: 12 });
    s += icon('clock', 1050, y + h / 2 - 8, 16, overdue ? t.danger : t.t3);
    s += txt(1076, y + h / 2 - 2, title, {
      size: 12.5, weight: overdue ? 600 : 500, fill: t.t1,
    });
    s += txt(1392, y + h / 2 - 2, time, {
      size: 11, weight: overdue ? 600 : 400, fill: overdue ? t.danger : t.t3, anchor: 'end',
    });
    if (!overdue && i < 2) s += line(1032, y + h + 6, 1404, y + h + 6, t.border, 1);
  });
  s += txt(1404, 548, '查看全部提醒 →', { size: 12, weight: 500, fill: t.primary, anchor: 'end' });

  // —— 各阶段分布（右下）——
  s += card(t, RX, 584, RW, 400);
  s += txt(1032, 627, '各阶段分布', { size: 15, weight: 700, fill: t.t1 });
  const isLight = t.name === 'light';
  const segs = [
    ['已投递', 5, isLight ? '#6366f1' : '#818cf8'],
    ['已挂', 4, isLight ? '#f87171' : '#f87171'],
    ['想投', 3, isLight ? '#a5b4fc' : '#a5b4fc'],
    ['笔试', 2, isLight ? '#8b5cf6' : '#a78bfa'],
    ['面试', 2, isLight ? '#c084fc' : '#c084fc'],
    ['Offer', 1, isLight ? '#10b981' : '#34d399'],
    ['关闭', 1, isLight ? '#d3d7e0' : '#3c414e'],
  ];
  const dcx = 1208, dcy = 748, r1 = 54, r2 = 78;
  let a = -Math.PI / 2;
  for (const [, n, color] of segs) {
    const a1 = a + (n / 18) * Math.PI * 2;
    s += donutSegment(dcx, dcy, r1, r2, a, a1, color);
    a = a1;
  }
  s += ctxt(dcx, dcy - 6, '18', { size: 24, weight: 700, fill: t.t1 });
  s += ctxt(dcx, dcy + 18, '总投递', { size: 10.5, fill: t.t3 });
  segs.forEach(([name, n, color], i) => {
    const lx = 1036 + (i < 4 ? 0 : 196);
    const ly = 856 + (i % 4) * 27;
    s += circle(lx, ly - 4, 4.5, color);
    s += txt(lx + 18, ly, `${name} · ${n}`, { size: 11.5, fill: t.t2 });
  });

  return s;
}
