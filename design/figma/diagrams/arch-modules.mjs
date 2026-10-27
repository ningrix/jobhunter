// 第4章配图：图4.1 总体架构 + 图4.2~4.6 模块功能结构图
import {
  svgWrap, proc, rect, txt, ctxt, flowArrow, fnode, layerBox, line, mtxt,
} from './lib.mjs';

/* ———— 图4.1 系统总体架构图 ———— */
export function dArch() {
  const W = 1280, H = 980;
  const X = 40, IW = W - 80;
  let s = '';

  // 第1层：页面层
  s += layerBox(X, 30, IW, 168, '页面层（Next.js App Router · React 19）', { subtitle: '统一客户端 fetch：响应信封解析 · 401 自动刷新重试 · AI 任务轮询' });
  const feItems = ['登录 / 注册', '数据仪表盘', '简历工作台', '职位中心', '官方招聘导航', '系统设置'];
  const fw = 168, gap = (IW - 40 - fw * 6) / 5;
  feItems.forEach((t, i) => {
    const x = X + 20 + i * (fw + gap);
    s += proc(x + fw / 2, 128, fw, 52, t, { fill: '#ffffff' });
  });

  // 第2层：API 路由层
  s += layerBox(X, 248, IW, 150, 'API 路由层（/api/v1 · 14 组资源 · 薄控制器）');
  s += proc(W / 2, 318, 700, 56, ['defineRoute 统一管线：JWT 鉴权 → Zod 校验 → 业务编排 → 错误码映射'], { fill: '#ffffff' });
  s += txt(W / 2, 378, 'auth · users · files · resumes · jobs · matches · ai-tasks · ai-usage · settings · dashboard · company-sources · radar · policies · health', { size: 12.5, fill: '#444', anchor: 'middle' });

  // 第3层：领域服务层
  s += layerBox(X, 448, IW, 172, '领域服务层（src/server/core）');
  const coreItems = [
    ['auth', '认证 / 会话'], ['resume', '简历与版本'], ['job', '职位与收藏'],
    ['match', '匹配编排'], ['scorer', '规则评分'], ['ranking', '混合排序'],
    ['user', '画像 / 权重'], ['policy', '求职条件'], ['dashboard', '统计看板'],
  ];
  const gap2 = 6;
  const cw = Math.floor((IW - 40 - gap2 * 8) / 9);
  coreItems.forEach(([t, sub], i) => {
    const cx = X + 20 + cw / 2 + i * (cw + gap2);
    s += fnode(cx, 540, cw, 56, [t, sub], { size: 11.5 });
  });

  // 第4层：基础设施层
  s += layerBox(X, 670, IW, 276, '基础设施层');
  const colW2 = 272, colGap = 24;
  const cols = [
    { x: X + 20, title: 'SQLite · Drizzle ORM', lines: ['18 张表 · 类型安全查询', '生产可迁移 PostgreSQL'] },
    { x: X + 20 + (colW2 + colGap), title: 'AI 编排（server/ai）', lines: ['gateway 限额计量 · runner 状态机', 'providers：本地引擎 / OpenAI 兼容'] },
    { x: X + 20 + (colW2 + colGap) * 2, title: '职位来源（job-sources）', lines: ['站点目录 · 规范化 + SHA-256 指纹', '三级去重 · 8 个平台适配器'] },
    { x: X + 20 + (colW2 + colGap) * 3, title: '雷达编排（server/radar）', lines: ['按求职条件扫描公开招聘页', 'AI 抽取防编造 · 审计留痕'] },
  ];
  cols.forEach((c) => {
    s += rect(c.x, 720, colW2, 196, { rx: 8, fill: '#ffffff' });
    s += txt(c.x + colW2 / 2, 748, c.title, { size: 14, weight: 700, anchor: 'middle' });
    c.lines.forEach((l, i) => {
      s += txt(c.x + 14, 782 + i * 24, l, { size: 12, fill: '#444' });
    });
  });

  // 层间箭头
  [W / 2 - 380, W / 2, W / 2 + 380].forEach((x) => {
    s += flowArrow([[x, 198], [x, 248]]);
    s += flowArrow([[x, 398], [x, 448]]);
    s += flowArrow([[x, 620], [x, 670]]);
  });

  return { w: W, h: H, svg: svgWrap(W, H, s) };
}

/* ———— 通用功能结构树（左侧母线 + 横支线，不穿卡片） ———— */
function tree(rootLabel, branches) {
  const W = 1280;
  const n = branches.length;
  const colW = 296;
  const totalW = colW * n;
  const x0 = (W - totalW) / 2;
  const maxLeaves = Math.max(...branches.map((b) => b.leaves.length));
  const H = 96 + 74 + 26 + maxLeaves * 62 + 26;
  let s = '';
  const rootCx = W / 2;
  s += fnode(rootCx, 58, 250, 60, rootLabel, { size: 16 });
  branches.forEach((b, i) => {
    const cx = x0 + colW * i + colW / 2;
    const cy = 172;
    s += fnode(cx, cy, colW - 30, 54, b.label, { size: 14.5 });
    // 根 → 一级：竖线 + 横线 + 下折
    s += line(rootCx, 88, rootCx, 118, {});
    s += line(x0 + colW / 2, 118, x0 + colW * (n - 1) + colW / 2, 118, {});
    s += flowArrow([[cx, 118], [cx, 145]]);
    // 一级 → 叶子：左侧母线
    const leafW = colW - 96;
    const busX = cx - leafW / 2 - 16;
    const y0 = 232;
    const yLast = y0 + (b.leaves.length - 1) * 62;
    s += line(cx, cy + 27, cx, 206, {});
    if (b.leaves.length > 0) {
      s += line(cx, 206, busX, 206, {});
      s += line(busX, 206, busX, yLast, {});
    }
    b.leaves.forEach((leaf, j) => {
      const ly = y0 + j * 62;
      s += fnode(cx + 14, ly, leafW, 48, leaf, { size: 13, grad: j === 0 ? 'gBlue' : 'gBlue' });
      s += line(busX, ly, cx + 14 - leafW / 2, ly, {});
    });
  });
  return { w: W, h: H, svg: svgWrap(W, H, s) };
}

/* ———— 图4.2 简历工作台功能结构图 ———— */
export function dModuleResume() {
  return tree('简历工作台', [
    { label: '简历档案管理', leaves: ['新建简历档案', '上传文件解析', '主简历标记', '归档 / 软删除'] },
    { label: '版本管理', leaves: ['多版本记录', '结构化内容编辑', '版本溯源备注'] },
    { label: 'AI 诊断', leaves: ['诊断评分', '问题清单', '逐条优化建议', '采纳生成新版本'] },
    { label: '简历输出', leaves: ['A4 实时预览', '打印 / 导出'] },
  ]);
}

/* ———— 图4.3 职位中心功能结构图 ———— */
export function dModuleJobs() {
  return tree('职位中心', [
    { label: '职位管理', leaves: ['职位列表与筛选', '职位收藏', '归档管理'] },
    { label: '职位导入', leaves: ['粘贴 JD 解析', '手动录入', '雷达自动入库'] },
    { label: '职位详情', leaves: ['结构化字段', '技能标签', '来源与原始链接'] },
    { label: '数据导出', leaves: ['Excel 批量导出', '筛选结果导出'] },
  ]);
}

/* ———— 图4.4 智能匹配功能结构图 ———— */
export function dModuleMatch() {
  return tree('智能匹配', [
    { label: '规则评分', leaves: ['五维规则评分', '维度得分明细'] },
    { label: '语义排序（可选）', leaves: ['向量语义分', 'LLM Judge 复核', '混合加权排序'] },
    { label: '可解释输出', leaves: ['匹配总分', '优势清单', '差距与风险'] },
    { label: '匹配偏好', leaves: ['权重向量调整', '语义层开关'] },
  ]);
}

/* ———— 图4.5 职位雷达功能结构图 ———— */
export function dModuleRadar() {
  return tree('职位雷达', [
    { label: '站点目录', leaves: ['企业 / 平台分类', '官方招聘入口', '域名验证标注'] },
    { label: '扫描任务', leaves: ['求职条件过滤', '页面安全抓取', 'AI 要素抽取'] },
    { label: '去重入库', leaves: ['三级去重', '来源合并标记', '自动建档'] },
    { label: '审计追踪', leaves: ['动作事件留痕', '扫描结果报告'] },
  ]);
}

/* ———— 图4.6 系统设置功能结构图 ———— */
export function dModuleSettings() {
  return tree('系统设置', [
    { label: '求职条件', leaves: ['期望城市', '薪资区间', '岗位 / 雇佣类型'] },
    { label: '模型接入', leaves: ['服务商与模型选择', 'API Key 加密存储', '连接测试'] },
    { label: '匹配偏好', leaves: ['权重向量', '语义开关'] },
    { label: '账号安全', leaves: ['登录 / 注册', '本地单用户模式', '退出登录'] },
  ]);
}
