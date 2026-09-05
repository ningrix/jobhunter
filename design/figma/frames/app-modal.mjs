// 投递详情弹窗 · 阶段流转 + 时间线 + 备注 + 设提醒（叠在看板之上）
import {
  rect, txt, ctxt, icon, card, line, chip, chipW, badge, inputBox, fit, textW,
} from '../components.mjs';
import { applicationsFrame } from './applications.mjs';

export function appModalFrame(t) {
  let s = applicationsFrame(t);
  s += rect(0, 0, 1440, 1024, t.scrim);

  const mx = 440, my = 152, mw = 560, mh = 720;
  s += card(t, mx, my, mw, mh, { rx: 20 });
  const L = mx + 28, R = mx + mw - 28, IW = mw - 56;

  // 标题
  s += txt(L, my + 40, '前端开发工程师 · 字节跳动', { size: 15.5, weight: 700, fill: t.t1 });
  s += icon('close', R - 16, my + 26, 16, t.t3);
  s += icon('pin', L, my + 56, 13, t.t3);
  s += txt(L + 18, my + 67, '北京', { size: 11.5, fill: t.t2 });
  s += icon('wallet', L + 78, my + 56, 13, t.t3);
  s += txt(L + 96, my + 67, '25-45K · 14薪', { size: 11.5, weight: 600, fill: t.success });
  const bw = chipW('匹配 86', 11) + 2;
  s += badge(R - bw, my + 61, '匹配 86', 'success', t, { size: 11, h: 20 }).svg;
  s += line(L, my + 92, R, my + 92, t.border, 1);

  // 阶段流转
  s += txt(L, my + 120, '当前阶段', { size: 11, weight: 500, fill: t.t3 });
  s += rect(L, my + 132, 64, 30, t.primarySoft, { rx: 15, stroke: t.primarySoftBorder });
  s += ctxt(L + 32, my + 147, '面试', { size: 12, weight: 600, fill: t.primary });
  const flows = ['Offer', '已挂'];
  let fx = L + 78;
  for (const f of flows) {
    const fw = chipW(`→ ${f}`, 12) + 20;
    s += rect(fx, my + 132, fw, 30, t.surface, { rx: 15, stroke: t.borderStrong });
    s += ctxt(fx + fw / 2, my + 147, `→ ${f}`, { size: 12, weight: 500, fill: t.t2 });
    fx += fw + 10;
  }
  s += txt(R, my + 147, '流转需符合状态机规则', { size: 10.5, fill: t.t3, anchor: 'end' });
  s += line(L, my + 182, R, my + 182, t.border, 1);

  // 时间线
  s += txt(L, my + 210, '动态与备注', { size: 13, weight: 700, fill: t.t1 });
  const tlx = L + 8, ty0 = my + 238, step = 72;
  const events = [
    ['09/05 11:30', '笔试 → 面试', '下周二 14:00 二面，重点准备项目深挖'],
    ['09/02 16:40', '已投递 → 笔试', '笔试通过，题目偏工程化'],
    ['08/29 10:05', '想投 → 已投递', ''],
    ['08/28 14:20', '创建投递', '来自职位中心 · 匹配 86 分'],
  ];
  s += line(tlx, ty0 + 4, tlx, ty0 + (events.length - 1) * step + 4, t.border, 2);
  events.forEach(([time, ev, note], i) => {
    const cy = ty0 + i * step;
    s += `<circle cx="${tlx}" cy="${cy + 4}" r="5" fill="${i === 0 ? t.primary : t.surface}" stroke="${i === 0 ? t.primary : t.borderStrong}" stroke-width="2"/>`;
    s += txt(tlx + 22, cy, time, { size: 10.5, fill: t.t3 });
    s += txt(tlx + 22 + textW(time, 10.5) + 10, cy, ev, { size: 12, weight: 600, fill: t.t1 });
    if (note) s += txt(tlx + 22, cy + 20, fit(note, IW - 30, 11.5), { size: 11.5, fill: t.t2 });
  });
  // 备注输入
  const ny = my + 540;
  s += inputBox(L, ny, IW - 78, '添加跟进备注…', t, { h: 38 }).svg;
  s += rect(R - 66, ny - 19, 66, 38, 'url(#gradBtn)', { rx: 10 });
  s += ctxt(R - 33, ny + 4.6, '添加', { size: 12.5, weight: 600, fill: '#ffffff' });
  s += line(L, ny + 40, R, ny + 40, t.border, 1);

  // 设提醒
  s += rect(L, ny + 56, IW, 96, t.surface2, { rx: 14 });
  s += icon('bell', L + 16, ny + 72, 15, t.warn);
  s += txt(L + 38, ny + 84, '为此投递设提醒', { size: 12, weight: 600, fill: t.t2 });
  s += inputBox(L + 16, ny + 118, 268, '提醒标题，如：准备二面', t, { h: 36, fill: t.surface }).svg;
  s += inputBox(L + 296, ny + 118, 118, '', t, { h: 36, value: '09/08 14:00', fill: t.surface, icon: 'calendar' }).svg;
  s += rect(R - 74, ny + 100, 74, 36, t.warn, { rx: 10 });
  s += ctxt(R - 37, ny + 122.6, '创建', { size: 12.5, weight: 600, fill: '#ffffff' });
  return s;
}
