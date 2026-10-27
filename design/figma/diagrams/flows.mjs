// 第3章配图：图3.1 用例图 + 图3.2~3.7 流程图
import {
  svgWrap, proc, stadium, diamond, flowArrow, actor, usecase, rect, txt, ctxt, link, mtxt,
} from './lib.mjs';

const YN = { size: 13, weight: 600 };

/* ———— 图3.1 求职者用例图 ———— */
export function dUseCase() {
  const W = 820, H = 640;
  const items = [
    '注册 / 登录', '维护求职画像与偏好', '上传 / 编辑简历', 'AI 简历诊断与优化',
    '粘贴 JD 导入职位', '雷达扫描导入职位', '职位收藏管理', '计算人岗匹配分',
    '查看匹配优势与差距', '调整匹配权重向量', '配置大模型与密钥', '导出职位 Excel',
  ];
  const bx = 150, bw = W - bx - 16, by = 30, bh = H - 60;
  const cols = [bx + 180, bx + 445];
  const rows = [104, 190, 276, 362, 448, 534];
  let s = rect(bx, by, bw, bh, { fill: '#FCFDFF', rx: 12 }) +
    ctxt(bx + bw / 2, by + 26, '智能求职系统', { size: 15, weight: 700 });
  items.forEach((label, i) => {
    const cx = cols[Math.floor(i / 6)];
    const cy = rows[i % 6];
    s += usecase(cx, cy, 238, 62, label, { size: 13 });
  });
  const ax = 66, ay = H / 2 - 20;
  s += actor(ax, ay, '求职者', { size: 0.86 });
  items.forEach((_, i) => {
    const cx = cols[Math.floor(i / 6)];
    const cy = rows[i % 6];
    s += link(ax + 14, ay - 16, cx - 119, cy, {});
  });
  return { w: W, h: H, svg: svgWrap(W, H, s) };
}

/* ———— 图3.2 认证流程图 ———— */
export function dAuthFlow() {
  const W = 1400, H = 830;
  const C = 700, L = 330, R = 1050;
  let s = '';
  s += stadium(C, 60, 170, 48, '开始');
  s += proc(C, 142, 240, 52, '用户访问系统');
  s += flowArrow([[C, 84], [C, 116]]);
  s += flowArrow([[C, 168], [C, 192]]);
  s += diamond(C, 242, 224, 96, '本地单用户模式？');
  // 是 → 左
  s += flowArrow([[C - 112, 242], [L, 242]], { label: '是', lx: C - 180, ly: 226, ...YN });
  s += proc(L, 242, 262, 56, ['自动加载 / 创建', '本地单用户']);
  s += flowArrow([[L, 270], [L, 448], [C - 132, 448]]);
  // 否 → 右
  s += flowArrow([[C + 112, 242], [R - 128, 242]], { label: '否', lx: C + 178, ly: 226, ...YN });
  s += proc(R, 242, 258, 56, '校验 JWT 访问令牌');
  s += flowArrow([[R, 270], [R, 312]]);
  s += diamond(R, 362, 204, 92, '令牌有效？');
  // 有效 → 中
  s += flowArrow([[R - 102, 362], [C + 4, 362], [C + 4, 420]], { label: '是', lx: R - 170, ly: 346, ...YN });
  // 无效 → 401
  s += flowArrow([[R, 408], [R, 450]], { label: '否', lx: R + 22, ly: 432, ...YN });
  s += proc(R, 480, 276, 56, '返回 401，携带刷新令牌重试');
  s += flowArrow([[R, 508], [R, 536]]);
  s += diamond(R, 588, 204, 92, '刷新成功？');
  // 刷新成功 → 业务
  s += flowArrow([[R - 102, 588], [870, 588], [870, 552], [C + 126, 552]], { label: '是', lx: R - 160, ly: 572, ...YN });
  // 刷新失败 → 登录页
  s += flowArrow([[R, 634], [R, 676]], { label: '否', lx: R + 22, ly: 658, ...YN });
  s += proc(R, 706, 262, 56, '跳转登录页重新认证');
  s += flowArrow([[R - 131, 706], [C + 126, 706], [C + 126, 584]]);
  // 汇合
  s += proc(C, 448, 260, 56, '签发 / 续期访问令牌');
  s += flowArrow([[C, 476], [C, 520]]);
  s += proc(C, 550, 250, 56, '进入业务请求处理');
  s += flowArrow([[C, 578], [C, 640]]);
  s += stadium(C, 668, 170, 48, '结束');
  // 底注
  s += txt(W / 2 - 260, 780, '注：访问令牌短期有效，刷新令牌轮换存储（SHA-256 哈希落库）；生产环境强制登录。', { size: 12.5, fill: '#444' });
  return { w: W, h: H, svg: svgWrap(W, H, s) };
}

/* ———— 图3.3 简历诊断流程图 ———— */
export function dResumeFlow() {
  const W = 1200, H = 880;
  const C = 600, R = 930;
  let s = '';
  s += stadium(C, 55, 170, 48, '开始');
  s += flowArrow([[C, 79], [C, 100]]);
  s += proc(C, 130, 300, 56, ['上传简历文件', '（PDF / Word / Markdown）']);
  s += flowArrow([[C, 158], [C, 182]]);
  s += proc(C, 212, 280, 52, '解析为结构化文本');
  s += flowArrow([[C, 238], [C, 262]]);
  s += diamond(C, 312, 208, 92, '解析成功？');
  // 否 → 右侧错误提示，回到上传
  s += flowArrow([[C + 104, 312], [R - 130, 312]], { label: '否', lx: C + 156, ly: 296, ...YN });
  s += proc(R, 312, 250, 56, '提示失败并重新上传');
  s += flowArrow([[R, 284], [R, 130], [C + 156, 130]]);
  // 是 ↓
  s += flowArrow([[C, 358], [C, 384]], { label: '是', lx: C + 22, ly: 376, ...YN });
  s += proc(C, 414, 290, 56, '创建简历档案与初始版本');
  s += flowArrow([[C, 442], [C, 464]]);
  s += proc(C, 494, 280, 52, '发起 AI 诊断异步任务');
  s += flowArrow([[C, 520], [C, 542]]);
  s += proc(C, 572, 320, 56, ['模型输出诊断评分与优化建议', '（问题清单 / 逐条建议）']);
  s += flowArrow([[C, 600], [C, 622]]);
  s += diamond(C, 676, 220, 92, '是否采纳建议？');
  s += flowArrow([[C - 110, 676], [C - 320, 676]], { label: '采纳', lx: C - 220, ly: 660, ...YN });
  s += proc(300, 676, 260, 56, '按建议生成新简历版本');
  s += flowArrow([[300, 704], [300, 776], [C - 4, 776]]);
  s += flowArrow([[C + 110, 676], [C + 320, 676]], { label: '拒绝', lx: C + 220, ly: 660, ...YN });
  s += proc(R, 676, 250, 56, '保留当前版本');
  s += flowArrow([[R, 704], [R, 776], [C + 4, 776]]);
  s += stadium(C, 806, 170, 48, '结束');
  s += txt(W / 2 - 250, 858, '注：诊断由 AI 异步任务执行，本地引擎（离线确定性）与大模型两种 Provider 可切换。', { size: 12.5, fill: '#444' });
  return { w: W, h: H, svg: svgWrap(W, H, s) };
}

/* ———— 图3.4 JD 解析导入流程图 ———— */
export function dJdFlow() {
  const W = 1200, H = 900;
  const C = 600, R = 940;
  let s = '';
  s += stadium(C, 55, 170, 48, '开始');
  s += flowArrow([[C, 79], [C, 100]]);
  s += proc(C, 130, 300, 56, '用户粘贴职位 JD 全文');
  s += flowArrow([[C, 158], [C, 180]]);
  s += proc(C, 210, 280, 52, '发起 AI 解析异步任务');
  s += flowArrow([[C, 236], [C, 258]]);
  s += proc(C, 288, 400, 56, ['大模型结构化抽取', '（公司 / 职位 / 薪资 / 城市 / 技能标签）']);
  s += flowArrow([[C, 316], [C, 338]]);
  s += diamond(C, 392, 260, 96, '字段校验通过？');
  // 否 → 降级
  s += flowArrow([[C + 130, 392], [R - 158, 392]], { label: '否', lx: C + 172, ly: 376, ...YN });
  s += proc(R, 392, 310, 56, ['降级入库', '（保留原文，标记未结构化）']);
  s += flowArrow([[R, 420], [R, 690], [C + 130, 690]]);
  // 是 ↓
  s += flowArrow([[C, 440], [C, 464]], { label: '是', lx: C + 22, ly: 456, ...YN });
  s += proc(C, 494, 380, 56, '生成规范化内容指纹（SHA-256）');
  s += flowArrow([[C, 522], [C, 544]]);
  s += diamond(C, 598, 232, 92, '指纹已存在？');
  s += flowArrow([[C + 116, 598], [R - 125, 598]], { label: '是', lx: C + 158, ly: 582, ...YN });
  s += proc(R, 598, 240, 56, '去重提示，跳过入库');
  s += flowArrow([[R, 626], [R, 690], [C + 130, 690]]);
  s += flowArrow([[C, 644], [C, 662]], { label: '否', lx: C + 22, ly: 658, ...YN });
  s += proc(C, 692, 260, 56, '新建职位记录并关联企业');
  s += flowArrow([[C, 720], [C, 744]]);
  s += proc(C, 774, 260, 52, '刷新职位列表展示');
  s += flowArrow([[C, 800], [C, 820]]);
  s += stadium(C, 846, 170, 48, '结束');
  return { w: W, h: H, svg: svgWrap(W, H, s) };
}

/* ———— 图3.5 雷达扫描流程图 ———— */
export function dRadarFlow() {
  const W = 1240, H = 1000;
  const C = 600, R = 960;
  let s = '';
  s += stadium(C, 55, 190, 48, '开始（雷达扫描）');
  s += flowArrow([[C, 79], [C, 100]]);
  s += proc(C, 130, 320, 56, ['读取求职条件', '（期望城市 / 薪资 / 岗位类型）']);
  s += flowArrow([[C, 158], [C, 180]]);
  s += proc(C, 210, 300, 52, '遍历站点目录逐站扫描');
  s += flowArrow([[C, 236], [C, 258]]);
  s += proc(C, 288, 400, 56, ['抓取公开招聘列表页', '（安全抓取：私网地址拦截 / 超时控制）']);
  s += flowArrow([[C, 316], [C, 338]]);
  s += proc(C, 368, 400, 56, ['大模型抽取职位要素', '（仅依据页面可见文本，防编造）']);
  s += flowArrow([[C, 396], [C, 418]]);
  s += diamond(C, 472, 250, 96, '通过条件过滤？');
  // 否 → 审计跳过
  s += flowArrow([[C + 125, 472], [R - 142, 472]], { label: '否', lx: C + 172, ly: 456, ...YN });
  s += proc(R, 472, 280, 56, '记录审计事件后跳过');
  s += flowArrow([[R, 500], [R, 806], [C + 150, 806]]);
  // 是 ↓
  s += flowArrow([[C, 520], [C, 546]], { label: '是', lx: C + 22, ly: 538, ...YN });
  s += proc(C, 576, 400, 56, ['三级去重', '（来源 ID 唯一 / 内容指纹 / 相似提示）']);
  s += flowArrow([[C, 604], [C, 626]]);
  s += diamond(C, 680, 232, 92, '判定为重复？');
  s += flowArrow([[C + 116, 680], [R - 132, 680]], { label: '是', lx: C + 158, ly: 664, ...YN });
  s += proc(R, 680, 260, 56, '合并来源标记，不入库');
  s += flowArrow([[R, 708], [R, 806], [C + 150, 806]]);
  s += flowArrow([[C, 726], [C, 748]], { label: '否', lx: C + 22, ly: 742, ...YN });
  s += proc(C, 778, 390, 56, ['职位入库并写入审计日志', '（agent_events 全程留痕）']);
  s += flowArrow([[C, 806], [C, 828]]);
  s += diamond(C, 872, 250, 88, '还有未扫描站点？');
  s += flowArrow([[C - 125, 872], [300, 872], [300, 210], [C - 156, 210]], { label: '是', lx: 340, ly: 856, ...YN });
  s += flowArrow([[C, 916], [C, 934]], { label: '否', lx: C + 24, ly: 926, ...YN });
  s += stadium(C, 958, 250, 46, '输出扫描报告，结束');
  return { w: W, h: H, svg: svgWrap(W, H, s) };
}

/* ———— 图3.6 匹配计算流程图 ———— */
export function dMatchFlow() {
  const W = 1240, H = 840;
  const C = 620, R = 980;
  let s = '';
  s += stadium(C, 55, 190, 48, '开始（计算匹配）');
  s += flowArrow([[C, 79], [C, 100]]);
  s += proc(C, 132, 360, 60, ['选定主简历与目标职位', '读取用户画像与匹配权重向量']);
  s += flowArrow([[C, 162], [C, 185]]);
  s += proc(C, 215, 400, 60, ['五维规则评分', '（技能 / 经验 / 学历 / 薪资 / 城市）']);
  s += flowArrow([[C, 245], [C, 272]]);
  s += diamond(C, 322, 270, 96, '语义匹配开关开启？');
  // 是 → 右：语义层
  s += flowArrow([[C + 135, 322], [800, 322], [800, 290], [836, 290]], { label: '是', lx: C + 180, ly: 306, ...YN });
  s += proc(R, 290, 280, 60, ['向量检索计算语义分', '（附命中段落证据）']);
  s += flowArrow([[R, 320], [R, 345]]);
  s += proc(R, 375, 280, 60, ['LLM Judge 复核', '（0-100 分 + 评定理由）']);
  s += flowArrow([[R, 405], [R, 522], [C + 254, 522]]);
  // 否 ↓：纯规则
  s += flowArrow([[C, 370], [C, 400]], { label: '否', lx: C + 24, ly: 392, ...YN });
  s += proc(C, 432, 320, 62, ['权重向量归一化', '加权点积汇总规则总分']);
  s += flowArrow([[C, 463], [C, 488]]);
  s += proc(C, 522, 500, 64, ['计算总分', '总分 = w1·语义 + w2·规则 + w3·Judge（默认 0.4 / 0.3 / 0.3）']);
  s += flowArrow([[C, 554], [C, 578]]);
  s += proc(C, 610, 360, 60, ['生成可解释结论', '（优势 / 差距 / 风险清单）']);
  s += flowArrow([[C, 640], [C, 662]]);
  s += proc(C, 694, 340, 56, '匹配结果落库（job_matches）');
  s += flowArrow([[C, 722], [C, 744]]);
  s += stadium(C, 772, 280, 48, '输出匹配报告，结束');
  s += txt(W / 2 - 310, 816, '注：语义层默认关闭（纯规则向后兼容）；权重向量由用户在设置页调整并归一化。', { size: 12.5, fill: '#444' });
  return { w: W, h: H, svg: svgWrap(W, H, s) };
}

/* ———— 图3.7 AI 异步任务状态机图 ———— */
export function dAiTaskFlow() {
  const W = 1240, H = 660;
  let s = '';
  const y1 = 120;
  s += stadium(150, y1, 190, 50, '客户端发起请求');
  s += flowArrow([[245, y1], [285, y1]]);
  s += proc(410, y1, 240, 64, ['创建任务记录', 'status = queued']);
  s += flowArrow([[530, y1], [560, y1]]);
  s += proc(680, y1, 220, 64, ['执行器领取', 'status = running']);
  s += flowArrow([[790, y1], [815, y1]]);
  s += proc(950, y1, 290, 64, ['网关选择 Provider 调用模型', '（本地引擎 / 用户大模型）']);
  s += flowArrow([[950, 152], [950, 224]]);
  s += diamond(950, 278, 210, 96, '执行成功？');
  // 是 → succeeded
  s += flowArrow([[845, 278], [700, 278]], { label: '是', lx: 770, ly: 262, ...YN });
  s += proc(565, 278, 260, 64, ['status = succeeded', '写回 output 与用量计量']);
  s += flowArrow([[435, 278], [245, 278]]);
  s += stadium(150, 278, 190, 50, '客户端获取结果');
  s += ctxt(335, 262, '轮询 / SSE 订阅进度', { size: 12.5, fill: '#444' });
  // 否 → 重试判断
  s += flowArrow([[950, 326], [950, 376]], { label: '否', lx: 974, ly: 354, ...YN });
  s += diamond(950, 432, 224, 96, '已达重试上限？');
  // 否（≤3次）→ 回到 running
  s += flowArrow([[838, 432], [730, 432], [730, 156]], { label: '否（≤3 次，重新执行）', lx: 652, ly: 414, size: 12.5, weight: 600 });
  // 是 → failed
  s += flowArrow([[950, 480], [950, 520]], { label: '是', lx: 974, ly: 504, ...YN });
  s += proc(950, 552, 260, 64, ['status = failed', '写回 error，前端提示']);
  // 注
  s += txt(60, 636, '注：任务表（ai_tasks）记录 0-100 进度与阶段文案；网关统一执行日限额与 Token 用量计量（ai_usage_logs）。', { size: 12.5, fill: '#444' });
  return { w: W, h: H, svg: svgWrap(W, H, s) };
}
