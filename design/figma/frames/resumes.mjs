// 简历工作台 · 新建/上传工具条 + 简历卡网格（主简历徽标/AI 评分/操作）
import {
  rect, txt, icon, card, line, chip, badge, chipW, btnPrimary, btnOutline, btnSoft,
  inputBox, sidebar, fit,
} from '../components.mjs';
import { CONTENT_X } from '../components.mjs';

const RESUMES = [
  { name: '前端主简历', main: true, updated: '2026/8/30 14:32', score: 82, skills: ['React', 'TypeScript', 'Node.js'] },
  { name: '前端-字节定制版', main: false, updated: '2026/8/29 20:15', score: 86, skills: ['React', '性能优化', '工程化'] },
  { name: '全栈方向简历', main: false, updated: '2026/8/28 11:08', score: 74, skills: ['Nest.js', 'PostgreSQL', 'Docker'] },
  { name: '后端方向简历', main: false, updated: '2026/8/26 09:40', score: 68, skills: ['Node.js', 'Redis', 'MySQL'] },
  { name: '实习生简历', main: false, updated: '2026/8/20 16:22', score: 63, skills: ['JavaScript', 'Vue2', 'H5'] },
  { name: '历史版本 v1', main: false, updated: '2026/8/12 10:05', score: 55, skills: ['JavaScript', 'CSS'] },
];

export function resumesFrame(t) {
  let s = rect(0, 0, 1440, 1024, t.bg);
  s += `<circle cx="1220" cy="-40" r="380" fill="url(#glowA)" opacity="${t.name === 'light' ? 0.5 : 0.7}"/>`;
  s += sidebar(t, 'resumes');

  s += txt(CONTENT_X, 86, '简历工作台', { size: 23, weight: 700, fill: t.t1 });
  s += txt(CONTENT_X + 132, 85, '上传 txt / md / pdf / docx，AI 自动结构化解析', { size: 12, fill: t.t3 });

  // 工具条
  s += card(t, CONTENT_X, 120, 1144, 76, { rx: 16 });
  s += inputBox(288, 158, 360, '新简历名称，如「前端主简历」', t).svg;
  const nb = btnPrimary(0, 158, '新建空白简历', t, { icon: 'plus' });
  s += `<g transform="translate(672 0)">${nb.svg}</g>`;
  const ub = btnOutline(0, 158, '上传简历文件', t, { icon: 'upload', color: t.primary });
  s += `<g transform="translate(${672 + nb.w + 14} 0)">${ub.svg}</g>`;
  s += icon('sparkle', 1150, 146, 18, t.primary);
  s += txt(1174, 160, '解析引擎就绪', { size: 11.5, fill: t.t3 });

  // 简历卡网格（3 列 × 3 行）
  const cw = 368, ch = 250;
  const rows = [
    ...RESUMES,
    { name: '运营方向简历', main: false, updated: '2026/8/8 18:44', score: 58, skills: ['JavaScript', '小程序'] },
    { name: '英文简历 EN', main: false, updated: '2026/7/30 09:12', score: 71, skills: ['React', 'English'] },
    { name: '校招备用简历', main: false, updated: '2026/7/22 14:50', score: 49, skills: ['C++', '基础算法'] },
  ];
  rows.forEach((r, i) => {
    const x = CONTENT_X + (i % 3) * (cw + 20);
    const y = 220 + Math.floor(i / 3) * (ch + 16);
    s += resumeCard(t, x, y, cw, ch, r);
  });
  return s;
}

function resumeCard(t, x, y, w, h, r) {
  let s = card(t, x, y, w, h);
  s += rect(x + 24, y + 24, 40, 40, t.primarySoft, { rx: 12 });
  s += icon('doc', x + 33, y + 33, 22, t.primary);
  s += txt(x + 76, y + 43, fit(r.name, 160, 14.5), { size: 14.5, weight: 700, fill: t.t1 });
  if (r.main) {
    const bw = chipW('主简历', 11) + 2;
    s += badge(x + w - 24 - bw, y + 38, '主简历', 'warn', t, { size: 11, h: 22 }).svg;
  }
  s += txt(x + 76, y + 63, `更新于 ${r.updated}`, { size: 11, fill: t.t3 });
  // AI 评分
  s += chip(x + 24, y + 102, `AI 评分 ${r.score}`, {
    t, fill: r.score >= 75 ? t.successSoft : r.score >= 55 ? t.warnSoft : t.dangerSoft,
    stroke: r.score >= 75 ? t.successBorder : r.score >= 55 ? t.warnBorder : t.dangerBorder,
    textFill: r.score >= 75 ? t.success : r.score >= 55 ? t.warn : t.danger,
    h: 24, size: 11.5, weight: 600,
  }).svg;
  // 技能
  let cxp = x + 24;
  for (const sk of r.skills) {
    const w2 = chipW(sk, 11) + 2;
    s += chip(cxp, y + 140, sk, { t, fill: t.surface2, textFill: t.t2, stroke: t.border, h: 22, size: 11 }).svg;
    cxp += w2 + 8;
  }
  s += line(x + 24, y + 170, x + w - 24, y + 170, t.border, 1);
  // 操作
  const eb = btnSoft(0, 0, '编辑 / AI 优化', t, { h: 32, icon: 'sparkle' });
  s += `<g transform="translate(${x + 24} ${y + 204})">${eb.svg}</g>`;
  let ax = x + 24 + eb.w + 8;
  s += chip(ax, y + 204, '设为主简历', { t, fill: t.surface2, textFill: t.t2, stroke: t.border, h: 32, size: 12 }).svg;
  ax += chipW('设为主简历', 12) + 8;
  s += chip(ax, y + 204, '删除', { t, fill: t.surface2, textFill: t.danger, stroke: t.border, h: 32, size: 12 }).svg;
  return s;
}
