// 简历编辑 · AI 诊断（评分环 + 问题 + 改前改后建议）+ 四宫格编辑区
import {
  rect, txt, ctxt, icon, card, line, chip, badge, btnPrimary, btnOutline,
  inputBox, sidebar, donutSegment, fit, textW, fieldBox,
} from '../components.mjs';
import { CONTENT_X } from '../components.mjs';

export function resumeDetailFrame(t) {
  let s = rect(0, 0, 1440, 1024, t.bg);
  s += `<circle cx="1220" cy="-40" r="380" fill="url(#glowA)" opacity="${t.name === 'light' ? 0.5 : 0.7}"/>`;
  s += sidebar(t, 'resumes');

  // 标题行
  s += txt(CONTENT_X, 86, '简历编辑 · v2', { size: 23, weight: 700, fill: t.t1 });
  s += inputBox(470, 76, 340, '', t, {
    value: 'v2 · 采纳 AI 优化建议（评分 82）', suffix: true, h: 38,
  }).svg;
  const ob = btnOutline(0, 76, '保存为新版本', t);
  s += `<g transform="translate(1144 0)">${ob.svg}</g>`;
  const ab = btnPrimary(0, 76, 'AI 优化建议', t, { icon: 'sparkle' });
  s += `<g transform="translate(${1408 - ab.w} 0)">${ab.svg}</g>`;

  // —— AI 诊断卡 ——
  s += card(t, CONTENT_X, 120, 1144, 344);
  s += txt(288, 162, 'AI 简历诊断', { size: 15, weight: 700, fill: t.t1 });
  s += badge(288 + 96, 157, '基于主简历 JD 匹配', 'primary', t, { size: 11, h: 22 }).svg;
  // 评分环
  const dcx = 356, dcy = 262;
  s += donutSegment(dcx, dcy, 36, 46, 0, Math.PI * 2 - 0.02, t.surface2);
  s += donutSegment(dcx, dcy, 36, 46, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 0.82, 'url(#gradBar)');
  s += ctxt(dcx, dcy - 2, '82', { size: 25, weight: 700, fill: t.t1 });
  s += ctxt(dcx, dcy + 22, '综合评分', { size: 10.5, fill: t.t3 });
  // 问题列表
  const probs = [
    ['工作经历缺少量化数据，影响力表达不足', 'danger'],
    ['个人优势与目标岗位 JD 关键词匹配度偏低', 'warn'],
    ['教育背景时间格式不统一，建议统一为 YYYY.MM', 'warn'],
  ];
  probs.forEach(([p, kind], i) => {
    const cy = 200 + i * 30;
    s += `<circle cx="482" cy="${cy - 4}" r="3.5" fill="${kind === 'danger' ? t.danger : t.warn}"/>`;
    s += txt(496, cy, p, { size: 12.5, fill: t.t2 });
  });
  // 采纳按钮
  const abW = textW('采纳并生成新版本', 13) + 32;
  s += rect(1384 - abW, 182, abW, 40, t.successSoft, { rx: 10, stroke: t.successBorder });
  s += icon('check', 1384 - abW + 14, 194, 15, t.success, 2);
  s += ctxt(1384 - abW / 2 + 8, 202, '采纳并生成新版本', { size: 13, weight: 600, fill: t.success });
  s += ctxt(1384 - abW / 2 + 8, 242, '将生成 v3 · 来源 AI', { size: 10.5, fill: t.t3 });
  s += line(288, 296, 1384, 296, t.border, 1);
  // 建议：改前 → 改后
  const sug = [
    ['工作经历', '负责前端页面开发', '主导 3 个核心页面重构，首屏加载耗时降低 42%', '量化成果，突出主导作用与业务影响'],
    ['个人优势', '熟悉 React、Vue 等框架', '5 年 React 深度实践，主导过日活 300w+ 项目架构', '补充规模与年限，增强可信度与竞争力'],
  ];
  sug.forEach(([mod, before, after, reason], i) => {
    const x = 288 + i * 558, w = 538, y = 316;
    s += rect(x, y, w, 124, t.surface2, { rx: 14 });
    s += chip(x + 16, y + 22, `[${mod}]`, { t, fill: t.primarySoft, textFill: t.primary, h: 22, size: 11, weight: 600 }).svg;
    s += txt(x + 16, y + 50, `改前 · ${before}`, {
      size: 11.5, fill: t.t3, ls: 0,
    }).replace('<text', '<text text-decoration="line-through"');
    s += txt(x + 16, y + 76, `改后 · ${fit(after, w - 32 - 40, 12)}`, { size: 12, weight: 600, fill: t.t1 });
    s += icon('sparkle', x + 16, y + 92, 12, t.primary);
    s += txt(x + 34, y + 102, `理由：${reason}`, { size: 11, fill: t.t3 });
  });

  // —— 四宫格编辑区 ——
  const grid = [
    { x: CONTENT_X, y: 484, title: '基本信息' },
    { x: CONTENT_X + 582, y: 484, title: '工作经历' },
    { x: CONTENT_X, y: 744, title: '教育背景' },
    { x: CONTENT_X + 582, y: 744, title: '项目经历' },
  ];
  for (const g of grid) {
    s += card(t, g.x, g.y, 562, 240);
    s += txt(g.x + 24, g.y + 34, g.title, { size: 13.5, weight: 700, fill: t.t1 });
  }
  // 基本信息
  s += fld(t, 288, 530, 249, '姓名', '李晓阳');
  s += fld(t, 553, 530, 249, '意向岗位', '前端开发工程师');
  s += fld(t, 288, 592, 249, '手机', '138****5678');
  s += fld(t, 553, 592, 249, '城市', '北京');
  s += fld(t, 288, 654, 249, '个人优势', '5 年 React 深度实践…');
  s += fld(t, 553, 654, 249, '技能（逗号分隔）', 'React, TypeScript, Node.js');
  // 工作经历
  s += rect(870, 530, 514, 140, t.surface2, { rx: 12 });
  s += fld4(t, 894, 544, '字节跳动', '前端工程师', '2022.07', '至今');
  s += txt(894, 634, '亮点（每行一条）', { size: 11.5, weight: 500, fill: t.t3 });
  s += inputBox(894, 650, 466, '', t, { h: 34, value: '主导 3 个核心页面重构，首屏耗时降低 42%' }).svg;
  s += txt(870, 700, '+ 添加经历', { size: 12, weight: 600, fill: t.primary });
  // 教育背景
  s += rect(288, 790, 514, 140, t.surface2, { rx: 12 });
  s += fld(t, 312, 804, 233, '学校', '浙江大学');
  s += fld(t, 569, 804, 233, '专业', '软件工程');
  s += fld(t, 312, 866, 233, '学历', '本科');
  s += fld(t, 569, 866, 233, '毕业年份', '2022');
  // 项目经历
  s += rect(870, 790, 514, 140, t.surface2, { rx: 12 });
  s += fld(t, 894, 804, 233, '项目名', '智能投递看板');
  s += fld(t, 1151, 804, 233, '角色', '负责人');
  s += txt(894, 894, '描述', { size: 11.5, weight: 500, fill: t.t3 });
  s += inputBox(894, 910, 466, '', t, { h: 34, value: 'Next.js 15 · AI 网关 · 异步任务队列' }).svg;
  s += txt(870, 970, '+ 添加项目', { size: 12, weight: 600, fill: t.primary });
  return s;
}

function fld(t, x, y, w, label, value) {
  let s = txt(x, y + 10, label, { size: 11.5, weight: 500, fill: t.t3 });
  s += inputBox(x, y + 34, w, value, t, { h: 36, value, valueFill: t.t1 }).svg;
  return s;
}
function fld4(t, x, y, v1, v2, v3, v4) {
  const labels = ['公司', '职位', '开始', '结束'];
  const vals = [v1, v2, v3, v4];
  const w = (466 - 3 * 12) / 4;
  let s = '';
  vals.forEach((v, i) => {
    s += fld(t, x + i * (w + 12), y, w, labels[i], v);
  });
  return s;
}
