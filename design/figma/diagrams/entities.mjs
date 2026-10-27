// 第4章配图：图4.7~4.11 实体属性图 + 图4.12 系统E-R图
import {
  svgWrap, entity, attr, rel, link, line, txt, ctxt, rect,
} from './lib.mjs';

/** 实体属性图：左侧实体 + 右侧竖排属性，字号大、可读性好 */
function attrDiagram(entityLabel, attrs) {
  const n = attrs.length;
  const rowH = 56, gap = 12;
  const top = 46;
  const W = 760;
  const H = Math.max(300, top * 2 + n * (rowH + gap) - gap);
  const ex = 150, ey = H / 2;
  const px = 330, pw = 372;
  let s = entity(ex, ey, 200, 84, entityLabel, { size: 17 });
  const firstCy = top + rowH / 2;
  const lastCy = firstCy + (n - 1) * (rowH + gap);
  const busX = ex + 100 + 40;
  const anchorY = Math.min(Math.max(ey, firstCy), lastCy);
  s += line(ex + 100, anchorY, busX, anchorY, {});
  s += line(busX, Math.min(firstCy, anchorY), busX, Math.max(lastCy, anchorY), {});
  attrs.forEach((a, i) => {
    const cy = firstCy + i * (rowH + gap);
    const isPk = a.endsWith("*");
    s += attr(px + pw / 2, cy, pw, rowH, isPk ? a.slice(0, -1) : a, { size: 16 });
    if (isPk) s += txt(px + pw - 8, cy + 4, "PK", { size: 13, fill: "#2563EB", weight: 700, anchor: "end" });
    s += line(busX, cy, px, cy, {});
  });
  return { w: W, h: H, svg: svgWrap(W, H, s) };
}

export const dEntityUser = () => attrDiagram('用户', [
  '用户ID*', '邮箱（唯一）', '密码哈希', '姓名', '账号状态', '创建时间',
]);
export const dEntityResume = () => attrDiagram('简历', [
  '简历ID*', '所属用户', '简历标题', '是否主简历', '视觉样式', '当前版本号', '创建时间',
]);
export const dEntityJob = () => attrDiagram('职位', [
  '职位ID*', '所属用户', '企业名称', '职位名称', '城市 / 区域', '薪资范围', 'JD 原文',
  '结构化字段', '来源与外链', '内容指纹', '状态',
]);
export const dEntityMatch = () => attrDiagram('匹配记录', [
  '记录ID*', '所属用户', '目标职位', '所用简历', '匹配总分', '维度得分',
  '差距清单', '优势理由', 'AI 解读', '创建时间',
]);
export const dEntityAiTask = () => attrDiagram('AI任务', [
  '任务ID*', '所属用户', '任务类型', '任务状态', '输入参数', '输出结果',
  '错误信息', '进度 / 阶段', '模型与Token', '创建时间',
]);

/* ———— 图4.12 系统E-R图 ———— */
export function dErTotal() {
  const W = 1280, H = 680;
  let s = '';
  const E = (x, y, label) => entity(x, y, 156, 60, label, { size: 14.5 });
  const R = (x, y, label) => rel(x, y, 116, 66, label);
  // 实体（第1~3行）
  s += E(130, 110, '用户画像'); s += E(430, 110, '用户'); s += E(730, 110, 'AI设置'); s += E(1030, 110, '投递策略');
  s += E(130, 330, '简历版本'); s += E(430, 330, '简历'); s += E(700, 330, '职位'); s += E(980, 330, '企业');
  s += E(560, 570, '匹配记录'); s += E(130, 570, 'AI任务');
  // 1:1：画像-用户 / 用户-AI设置 / 用户-投递策略
  s += R(285, 110, '拥有'); s += link(208, 110, 227, 110, {}); s += link(343, 110, 352, 110, {});
  s += ctxt(285, 64, '1:1', { size: 12, fill: '#64748B', weight: 600 });
  s += R(580, 110, '配置'); s += link(508, 110, 522, 110, {}); s += link(638, 110, 652, 110, {});
  s += ctxt(580, 64, '1:1', { size: 12, fill: '#64748B', weight: 600 });
  s += R(880, 110, '设定'); s += link(808, 110, 822, 110, {}); s += link(938, 110, 952, 110, {});
  s += ctxt(880, 64, '1:1', { size: 12, fill: '#64748B', weight: 600 });
  // 用户-简历 创建 1:n
  s += R(430, 222, '创建');
  s += link(430, 140, 430, 189, {}); s += txt(444, 168, '1', { size: 12 });
  s += link(430, 255, 430, 300, {}); s += txt(444, 282, 'n', { size: 12 });
  // 用户-职位 导入 1:n（斜线）
  s += R(580, 235, '导入');
  s += link(492, 138, 536, 202, {}); s += txt(496, 158, '1', { size: 12 });
  s += link(624, 268, 668, 300, {}); s += txt(650, 288, 'n', { size: 12 });
  // 简历-版本 包含 1:n
  s += R(285, 330, '包含');
  s += link(208, 330, 227, 330, {}); s += link(343, 330, 352, 330, {});
  s += txt(248, 312, 'n', { size: 12 }); s += txt(352, 348, '1', { size: 12 });
  // 职位-企业 归属 n:1
  s += R(840, 330, '归属');
  s += link(778, 330, 782, 330, {}); s += link(898, 330, 902, 330, {});
  s += txt(776, 312, 'n', { size: 12 }); s += txt(898, 312, '1', { size: 12 });
  // 简历-匹配记录 生成 1:n
  s += R(480, 450, '生成');
  s += link(452, 360, 462, 417, {}); s += txt(436, 392, '1', { size: 12 });
  s += link(502, 483, 540, 540, {}); s += txt(536, 516, 'n', { size: 12 });
  // 职位-匹配记录 针对 1:n
  s += R(830, 462, '针对');
  s += link(718, 358, 792, 432, {}); s += txt(738, 388, '1', { size: 12 });
  s += link(796, 492, 636, 566, {}); s += txt(664, 522, 'n', { size: 12 });
  // 用户-AI任务 发起 1:n（顶部绕行）
  s += R(60, 230, '发起');
  s += link(430, 80, 430, 58, {});
  s += link(430, 58, 60, 58, {});
  s += link(60, 58, 60, 197, {});
  s += link(60, 263, 60, 530, {});
  s += link(60, 530, 128, 545, {});
  s += txt(444, 70, '1', { size: 12 }); s += txt(74, 480, 'n', { size: 12 });
  // 图例
  s += rect(W - 340, H - 78, 310, 52, { fill: '#fafaf8', rx: 6 });
  s += txt(W - 326, H - 58, '矩形 = 实体；菱形 = 联系；1:1 / 1:n 为联系基数', { size: 12, fill: '#444' });
  s += txt(W - 326, H - 38, '用户—简历—职位 通过「匹配记录」建立多对多联系', { size: 12, fill: '#444' });
  return { w: W, h: H, svg: svgWrap(W, H, s) };
}
