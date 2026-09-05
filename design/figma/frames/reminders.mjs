// 提醒 · 创建工具条 + 筛选 Tab + 列表（到期/完成/忽略）
import {
  rect, txt, icon, card, line, chip, badge, chipW, btnPrimary, inputBox, fit, ctxt, sidebar, textW,
} from '../components.mjs';
import { CONTENT_X } from '../components.mjs';

const REMINDERS = [
  { title: '准备字节跳动二面', desc: '复盘项目深挖问题，准备系统设计讲题', time: '2026/8/30 14:30', overdue: true },
  { title: '跟进美团 HR 进度', desc: '', time: '2026/8/31 10:00' },
  { title: '修改简历后重新匹配「资深前端工程师」', desc: '', time: '2026/9/2 09:00' },
  { title: '准备快手笔试（算法题）', desc: '动态规划 + 手撕代码各一题', time: '2026/9/3 19:00' },
  { title: '复盘本周投递情况', desc: '', time: '2026/9/5 20:00' },
  { title: '整理面试复盘笔记', desc: '', time: '2026/9/6 21:00' },
];

export function remindersFrame(t) {
  let s = rect(0, 0, 1440, 1024, t.bg);
  s += `<circle cx="1220" cy="-40" r="380" fill="url(#glowA)" opacity="${t.name === 'light' ? 0.5 : 0.7}"/>`;
  s += sidebar(t, 'reminders');

  s += txt(CONTENT_X, 86, '提醒', { size: 23, weight: 700, fill: t.t1 });
  s += txt(1408, 86, '1 条提醒已到期', { size: 12.5, weight: 500, fill: t.danger, anchor: 'end' });

  // 工具条
  s += card(t, CONTENT_X, 120, 1144, 76, { rx: 16 });
  s += inputBox(288, 158, 400, '新提醒标题，如：跟进 HR / 准备笔试', t).svg;
  s += inputBox(708, 158, 220, '', t, { value: '2026/09/02 14:30', icon: 'calendar' }).svg;
  const cb = btnPrimary(0, 158, '创建提醒', t, { icon: 'bell' });
  s += `<g transform="translate(952 0)">${cb.svg}</g>`;
  const dw = chipW('今日到期 1', 11.5) + 2;
  s += badge(1408 - 24 - dw, 158, '今日到期 1', 'danger', t, { size: 11.5, h: 26 }).svg;

  // 筛选 Tab
  const tabs = ['待办', '已完成', '已忽略', '全部'];
  let tx = CONTENT_X;
  tabs.forEach((tab, i) => {
    const act = i === 0;
    const w = chipW(tab, 12.5) + 28;
    if (act) s += rect(tx, 219, w, 34, t.primary, { rx: 17 });
    else s += rect(tx, 219, w, 34, t.surface, { rx: 17, stroke: t.border });
    s += ctxt(tx + w / 2, 236, tab, {
      size: 12.5, weight: act ? 600 : 500, fill: act ? '#ffffff' : t.t2,
    });
    tx += w + 10;
  });
  s += txt(1408, 240, '按到期时间排序', { size: 11.5, fill: t.t3, anchor: 'end' });

  // 列表
  s += card(t, CONTENT_X, 272, 1144, 712);
  REMINDERS.forEach((r, i) => {
    const y = 296 + i * 110;
    if (r.overdue) {
      s += rect(288, y, 1096, 96, t.dangerSoft, { rx: 12 });
      s += rect(288, y, 4, 96, t.danger, { rx: 2 });
    } else if (i > 0) {
      s += line(288, y - 7, 1384, y - 7, t.border, 1);
    }
    s += txt(312, y + 34, r.title, { size: 13, weight: 600, fill: r.overdue ? t.danger : t.t1 });
    if (r.overdue) {
      const bw2 = chipW('已到期', 11) + 2;
      s += badge(312 + textW(r.title, 13) + 12, y + 29, '已到期', 'danger', t, { size: 11, h: 21 }).svg;
    }
    if (r.desc) s += txt(312, y + 58, fit(r.desc, 620, 11.5), { size: 11.5, fill: t.t3 });
    s += txt(1360, y + 33, r.time, {
      size: 11.5, weight: r.overdue ? 600 : 400, fill: r.overdue ? t.danger : t.t3, anchor: 'end',
    });
    // 操作：✓完成 + 忽略（右侧对齐）
    const iw = chipW('忽略', 11.5) + 18;
    s += chip(1360 - iw, y + 67, '忽略', { t, fill: t.surface, textFill: t.t2, stroke: t.borderStrong, h: 30, size: 11.5 }).svg;
    const doneW = 13 + 6 + chipW('完成', 11.5) + 12;
    const dx = 1360 - iw - 10 - doneW;
    s += rect(dx, y + 52, doneW, 30, t.successSoft, { rx: 15, stroke: t.successBorder });
    s += icon('check', dx + 12, y + 59, 13, t.success, 2);
    s += txt(dx + 31, y + 71.5, '完成', { size: 11.5, weight: 600, fill: t.success });
  });
  return s;
}
