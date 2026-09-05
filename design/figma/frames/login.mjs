// 登录页 · 左侧品牌渐变面板 + 右侧登录卡
import { rect, txt, ctxt, icon, inputBox, line, circle, textW } from '../components.mjs';

export function loginFrame(t) {
  const white = (o) => `rgba(255,255,255,${o})`;

  let s = rect(0, 0, 1440, 1024, t.bg);
  // 右侧背景微光
  s += `<circle cx="1360" cy="120" r="320" fill="url(#glowB)" opacity="${t.name === 'light' ? 0.5 : 0.8}"/>`;

  // —— 左侧品牌面板 ——
  s += `<rect x="0" y="0" width="792" height="1024" fill="url(#gradLogin)"/>`;
  s += `<circle cx="120" cy="80" r="300" fill="url(#glowA)" opacity="0.7"/>`;
  s += `<circle cx="700" cy="940" r="360" fill="url(#glowB)" opacity="0.7"/>`;
  // 品牌
  s += rect(64, 60, 200, 48, white(0.12), { rx: 13, stroke: white(0.22) });
  s += icon('target', 80, 74, 20, '#ffffff', 2);
  s += txt(110, 90, 'JobHunter', { size: 17, weight: 700, fill: '#ffffff' });
  // 主标题
  s += txt(64, 268, '让每一次投递，', { size: 36, weight: 700, fill: '#ffffff' });
  s += txt(64, 318, '都有 AI 陪你走完。', { size: 36, weight: 700, fill: '#ffffff' });
  s += txt(64, 360, '简历工作台 × 职位智能匹配 × 投递进度管理', { size: 15, fill: white(0.78) });
  // 特性列表
  const feats = [
    ['sparkle', 'AI 简历解析、诊断评分与一键优化'],
    ['target', 'JD 智能匹配评分，差距一目了然'],
    ['kanban', '投递全流程看板与到期提醒'],
  ];
  let fy = 420;
  for (const [ic, label] of feats) {
    s += rect(64, fy, 412, 52, white(0.1), { rx: 13, stroke: white(0.18) });
    s += circle(92, fy + 26, 14, white(0.16));
    s += icon(ic, 85, fy + 19, 14, '#ffffff', 1.9);
    s += txt(118, fy + 31, label, { size: 13.5, weight: 500, fill: white(0.92) });
    fy += 64;
  }
  // 迷你看板玻璃卡
  s += rect(64, 640, 456, 250, white(0.08), { rx: 18, stroke: white(0.16) });
  const cols = [
    ['想投', 2],
    ['面试', 1],
    ['Offer', 1],
  ];
  let cx0 = 88;
  for (const [name, n] of cols) {
    s += circle(cx0 + 5, 676, 4, white(0.5));
    s += txt(cx0 + 16, 681, name, { size: 11.5, weight: 600, fill: white(0.85) });
    for (let i = 0; i < 2; i++) {
      const cardY = 696 + i * 58;
      if (i < n) {
        s += rect(cx0 - 8, cardY, 128, 48, white(0.14), { rx: 10, stroke: white(0.14) });
        s += rect(cx0 + 4, cardY + 12, 76, 7, white(0.55), { rx: 3.5 });
        s += rect(cx0 + 4, cardY + 28, 48, 7, white(0.3), { rx: 3.5 });
      }
    }
    cx0 += 148;
  }
  s += txt(64, 946, 'JobHunter MVP · v1.0 概念设计', { size: 11, fill: white(0.55), ls: 1 });

  // —— 右侧登录卡 ——
  const x = 916, w = 440;
  s += rect(x, 212, w, 600, t.surface, { rx: 20, stroke: t.border });
  s += rect(x + 24, 244, 40, 40, 'url(#gradBtn)', { rx: 12 });
  s += icon('target', x + 32, 252, 24, '#ffffff', 2.1);
  s += txt(x + 74, 270, 'JobHunter', { size: 18, weight: 700, fill: t.t1 });
  s += txt(x + 24, 330, '欢迎回来', { size: 22, weight: 700, fill: t.t1 });
  s += txt(x + 24, 356, '登录你的求职工作台，继续今天的投递计划', { size: 12.5, fill: t.t3 });
  // 分段切换
  s += rect(x + 24, 384, 392, 40, t.surface2, { rx: 10 });
  s += rect(x + 24, 384, 196, 40, t.surface, { rx: 10, stroke: t.border });
  s += ctxt(x + 122, 404, '登录', { size: 13.5, weight: 600, fill: t.primary });
  s += ctxt(x + 294, 404, '注册', { size: 13.5, weight: 500, fill: t.t2 });
  // 表单
  s += inputBox(x + 24, 462, 392, '邮箱', t, { h: 44, icon: 'mail', value: 'demo@jobhunter.cn' }).svg;
  s += inputBox(x + 24, 518, 392, '密码（至少 8 位）', t, { h: 44, icon: 'lock', value: '••••••••' }).svg;
  s += txt(x + 24 + 392, 570, '忘记密码？', { size: 12, fill: t.primary, anchor: 'end', weight: 500 });
  // 登录按钮
  s += rect(x + 24, 592, 392, 44, 'url(#gradBtn)', { rx: 11 });
  s += ctxt(x + 24 + 196, 614, '登 录', { size: 14.5, weight: 700, fill: '#ffffff' });
  // 分隔线
  s += line(x + 24, 668, x + 186, 668, t.border, 1);
  s += line(x + 254, 668, x + 416, 668, t.border, 1);
  s += ctxt(x + 220, 672, '或', { size: 11, fill: t.t3 });
  // 演示账号（图标+文字整体居中）
  const demoLabel = '使用演示账号一键登录';
  const demoTotal = 17 + 8 + textW(demoLabel, 13);
  const demoX = x + 24 + (392 - demoTotal) / 2;
  s += rect(x + 24, 692, 392, 44, t.primarySoft, { rx: 11, stroke: t.primarySoftBorder });
  s += icon('user', demoX, 706, 17, t.primary);
  s += txt(demoX + 25, 714, demoLabel, { size: 13, weight: 600, fill: t.primary });
  s += ctxt(x + w / 2, 776, '登录即代表同意《服务条款》与《隐私政策》', { size: 10.5, fill: t.t3 });

  return s;
}
