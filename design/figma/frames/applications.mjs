// 投递看板 · 六列流水线（想投→已投递→笔试→面试→Offer→已挂）
import {
  rect, txt, icon, card, chip, chipW, sidebar, fit,
} from '../components.mjs';
import { CONTENT_X } from '../components.mjs';

export const COLS = [
  { name: '想投', color: '#a5b4fc', cards: [
    { title: 'Web 前端开发', company: '网易', salary: '18-30K' },
    { title: '全栈开发工程师', company: '小红书', salary: '28-40K', resume: '前端主简历' },
    { title: '前端开发工程师', company: '京东', salary: '20-35K' },
  ] },
  { name: '已投递', color: '#6366f1', cards: [
    { title: '前端开发工程师', company: '字节跳动', salary: '25-45K', resume: '前端主简历' },
    { title: '资深前端工程师', company: '美团', salary: '30-50K', resume: '前端主简历' },
    { title: '前端开发工程师', company: '腾讯', salary: '25-40K' },
    { title: '前端开发工程师', company: '阿里巴巴', salary: '30-50K' },
    { title: 'Web 前端开发', company: '百度', salary: '20-35K' },
  ] },
  { name: '笔试', color: '#8b5cf6', cards: [
    { title: '前端开发工程师', company: '快手', salary: '25-40K', resume: '前端主简历' },
    { title: '服务端开发工程师', company: '拼多多', salary: '30-50K' },
  ] },
  { name: '面试', color: '#c084fc', cards: [
    { title: '前端开发工程师', company: '字节跳动', salary: '25-45K', resume: '前端主简历' },
    { title: '前端开发工程师', company: '网易云音乐', salary: '22-35K' },
  ] },
  { name: 'Offer', color: '#10b981', cards: [
    { title: '前端开发工程师', company: '理想汽车', salary: '28-42K' },
  ] },
  { name: '已挂', color: '#f87171', cards: [
    { title: '前端开发工程师', company: '滴滴', salary: '25-40K' },
    { title: '前端开发工程师', company: '华为', salary: '22-38K' },
    { title: '前端开发工程师', company: '蔚来', salary: '25-40K' },
    { title: '前端开发工程师', company: '转转', salary: '20-32K' },
  ] },
];

export function applicationsFrame(t) {
  let s = rect(0, 0, 1440, 1024, t.bg);
  s += `<circle cx="1220" cy="-40" r="380" fill="url(#glowA)" opacity="${t.name === 'light' ? 0.5 : 0.7}"/>`;
  s += sidebar(t, 'applications');

  s += txt(CONTENT_X, 86, '投递看板', { size: 23, weight: 700, fill: t.t1 });
  s += txt(1408, 86, '共 17 个投递 · 阶段流转需符合规则', { size: 12.5, fill: t.t3, anchor: 'end' });

  const cw = 179, gap = 14, top = 120, ch = 840;
  COLS.forEach((col, i) => {
    const x = CONTENT_X + i * (cw + gap);
    s += rect(x, top, cw, ch, t.surface2, { rx: 14 });
    s += `<circle cx="${x + 18}" cy="${top + 26}" r="4" fill="${col.color}"/>`;
    s += txt(x + 30, top + 30, col.name, { size: 12.5, weight: 700, fill: t.t2 });
    const nW = chipW(String(col.cards.length), 10.5) + 2;
    s += chip(x + cw - 14 - nW, top + 26, String(col.cards.length), {
      t, fill: t.surface, textFill: t.t2, stroke: t.border, h: 20, size: 10.5, weight: 600,
    }).svg;
    col.cards.forEach((c, j) => {
      s += kanbanCard(t, x + 10, top + 56 + j * 96, cw - 20, c);
    });
  });
  return s;
}

function kanbanCard(t, x, y, w, c) {
  let s = card(t, x, y, w, 86, { rx: 12 });
  s += txt(x + 12, y + 25, fit(c.title, w - 24, 12.5), { size: 12.5, weight: 600, fill: t.t1 });
  s += txt(x + 12, y + 48, fit(c.company, 82, 11.5), { size: 11.5, fill: t.t2 });
  s += txt(x + w - 12, y + 48, c.salary, { size: 10.5, weight: 600, fill: t.success, anchor: 'end' });
  if (c.resume) {
    const tw = chipW(c.resume, 9.5, 5);
    const th = 18, tx = x + 12, ty = y + 68;
    s += rect(tx, ty - th / 2, tw + 15, th, t.primarySoft, { rx: 9 });
    s += icon('doc', tx + 5, ty - 5.5, 11, t.primary, 1.6);
    s += txt(tx + 19, ty + 3.3, c.resume, { size: 9.5, weight: 500, fill: t.primary });
  }
  return s;
}
