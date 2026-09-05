// 职位中心 · 搜索 + JD 粘贴解析 + 职位卡网格（匹配分/技能/收藏）
import {
  rect, txt, icon, card, line, chip, badge, chipW, btnPrimary, btnSoft,
  inputBox, sidebar, starFilled, fit, textW,
} from '../components.mjs';
import { CONTENT_X } from '../components.mjs';

const JOBS = [
  {
    title: '前端开发工程师', company: '字节跳动', city: '北京', salary: '25-45K · 14薪',
    score: 86, fav: true,
    skills: ['React', 'TypeScript', 'Node.js', '小程序', '工程化', 'CI/CD'],
    summary: '负责抖音电商前端业务开发，主导性能优化与工程化建设，要求 3 年以上 React 经验，熟悉主流构建工具链。',
  },
  {
    title: '资深前端工程师', company: '美团', city: '北京', salary: '30-50K',
    score: 72, fav: false,
    skills: ['Vue3', 'TypeScript', '低代码', '性能优化', '微前端'],
    summary: '负责到店业务前端架构升级，推动低代码平台落地，要求具备复杂中后台系统设计经验。',
  },
  {
    title: '全栈开发工程师', company: '小红书', city: '上海', salary: '28-40K',
    score: 64, fav: false,
    skills: ['React', 'Nest.js', 'PostgreSQL', 'Docker', 'AWS'],
    summary: '参与社区增长方向全栈开发，从需求评审到上线全流程参与，鼓励技术方案主导。',
  },
  {
    title: 'Web 前端开发', company: '网易', city: '杭州', salary: '18-30K',
    score: 41, fav: false,
    skills: ['JavaScript', 'CSS', 'Vue2', 'H5', '动画'],
    summary: '负责网易严选活动页与营销玩法的开发，对视觉还原与动效实现要求较高。',
  },
];

export function jobsFrame(t) {
  let s = rect(0, 0, 1440, 1024, t.bg);
  s += `<circle cx="1220" cy="-40" r="380" fill="url(#glowA)" opacity="${t.name === 'light' ? 0.5 : 0.7}"/>`;
  s += sidebar(t, 'jobs');

  // 标题行：标题 + 搜索 + 主按钮
  s += txt(CONTENT_X, 86, '职位中心', { size: 23, weight: 700, fill: t.t1 });
  const pb = btnPrimary(0, 76, '粘贴 JD 添加职位', t, { icon: 'plus' });
  const pbX = 1408 - pb.w;
  s += `<g transform="translate(${pbX} 0)">${pb.svg}</g>`;
  s += inputBox(pbX - 20 - 320, 76, 320, '搜索职位 / 公司 / JD 关键词', t, { icon: 'search' }).svg;

  // 职位卡网格（2 列，第三行溢出裁切示意滚动）
  const cw = 560, ch = 360;
  JOBS.forEach((j, i) => {
    const x = CONTENT_X + (i % 2) * (cw + 24);
    const y = 120 + Math.floor(i / 2) * (ch + 20);
    s += jobCard(t, x, y, cw, ch, j);
  });
  // 溢出第三行（被画布裁切，示意可滚动）
  const bleed = { title: '高级前端工程师', company: '蚂蚁集团', city: '杭州', salary: '35-55K', score: 0, fav: false, skills: [], summary: '' };
  s += jobCard(t, CONTENT_X, 120 + 2 * (ch + 20), cw, ch, bleed);
  s += jobCard(t, CONTENT_X + cw + 24, 120 + 2 * (ch + 20), cw, ch, { ...bleed, title: '前端开发专家', company: '腾讯云', score: 0 });

  return s;
}

function twoLines(s, maxW, size) {
  s = String(s);
  let acc = 0, cut = s.length;
  for (let i = 0; i < s.length; i++) {
    acc += textW(s[i], size);
    if (acc > maxW) { cut = i; break; }
  }
  return [s.slice(0, cut), s.slice(cut)];
}

function jobCard(t, x, y, w, h, j) {
  let s = card(t, x, y, w, h);
  // 标题行
  s += txt(x + 24, y + 42, j.title, { size: 15.5, weight: 700, fill: t.t1 });
  if (j.score) {
    const kind = j.score >= 75 ? 'success' : j.score >= 55 ? 'warn' : 'danger';
    const bw = chipW(`匹配 ${j.score}`, 11.5) + 2;
    s += badge(x + w - 24 - bw - 28, y + 36, `匹配 ${j.score}`, kind, t, { size: 11.5, h: 24 }).svg;
  }
  if (j.fav) s += starFilled(x + w - 48, y + 24, 19, '#f59e0b');
  else s += icon('star', x + w - 48, y + 24, 19, t.t3, 1.6);
  s += txt(x + 24, y + 66, j.company, { size: 12.5, fill: t.t2 });
  // 元信息
  s += icon('pin', x + 24, y + 88, 14, t.t3);
  s += txt(x + 44, y + 100, j.city, { size: 12, fill: t.t2 });
  s += icon('wallet', x + 120, y + 88, 14, t.t3);
  s += txt(x + 140, y + 100, j.salary, { size: 12.5, weight: 600, fill: t.success });
  // 技能 chips
  let cxp = x + 24;
  for (const sk of j.skills) {
    const cw2 = chipW(sk, 11.5);
    if (cxp + cw2 > x + w - 24) break;
    s += chip(cxp, y + 132, sk, { t, fill: t.surface2, textFill: t.t2, stroke: t.border, h: 24, size: 11.5 }).svg;
    cxp += cw2 + 8;
  }
  // JD 摘要（两行）
  if (j.summary) {
    const [l1, l2] = twoLines(j.summary, w - 48, 11.5);
    s += txt(x + 24, y + 166, l1, { size: 11.5, fill: t.t3 });
    s += txt(x + 24, y + 186, fit(l2, w - 48, 11.5), { size: 11.5, fill: t.t3 });
  }
  // 底部操作
  const mb = btnSoft(0, 0, '匹配我的简历', t, { h: 34, icon: 'target' });
  s += `<g transform="translate(${x + 24} ${y + h - 52})">${mb.svg}</g>`;
  s += txt(x + 24 + mb.w + 14, y + h - 52 + 4.5, '查看匹配记录', { size: 11.5, fill: t.t3 });
  return s;
}
