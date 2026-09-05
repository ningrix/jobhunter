# JobHunter 概念设计稿（Figma 导入用）

现代 SaaS 升级风（Linear / Vercel 质感）的 JobHunter 全站概念稿：**8 个画面 × 浅/深双主题 = 16 张 SVG**，每张 1440×1024。

## 文件结构

```
design/
├── preview.html            # 画廊预览（浅/深切换）
├── preview/                # 渲染出的 PNG（自查/验收用，可随时删除）
└── figma/
    ├── tokens.mjs          # 双主题设计 token（颜色/字体）
    ├── components.mjs      # SVG 组件库（按钮/卡片/图表/侧边栏/线性图标）
    ├── frames/*.mjs        # 每个画面的布局代码
    ├── build.mjs           # 构建入口
    └── frames/*.svg        # 产物：16 张可直接导入 Figma 的 SVG
```

## 画面清单

| 文件 | 画面 | 要点 |
|---|---|---|
| `login.*` | 登录 / 注册 | 左侧渐变品牌面板 + 右侧登录卡、演示账号一键登录 |
| `dashboard.*` | 仪表盘 | 统计卡、投递漏斗、近 8 周趋势、到期待办、阶段分布环图 |
| `jobs.*` | 职位中心 | JD 粘贴解析入口、匹配分（绿≥75 / 黄 55-74 / 红<55）、技能标签 |
| `resumes.*` | 简历工作台 | 新建/上传、主简历徽标、AI 评分、版本卡片 |
| `resume-detail.*` | 简历编辑 | AI 诊断评分环、改前→改后建议卡、四宫格编辑区 |
| `applications.*` | 投递看板 | 想投→已投递→笔试→面试→Offer→已挂 六列流水线 |
| `app-modal.*` | 投递详情弹窗 | 阶段流转（状态机）、动态时间线、跟进备注、设提醒 |
| `reminders.*` | 提醒 | 待办/已完成/已忽略/全部筛选、到期红标、完成/忽略 |

## 导入 Figma（推荐路径）

1. 打开 Figma（网页版或桌面版），新建设计文件。
2. 在 Finder / 资源管理器中选中 `design/figma/frames/` 下的 `.svg` 文件，**直接拖入 Figma 画布**。
   - 每个 SVG 会成为 1440×1024 的独立 Frame；
   - 文字保持为可编辑文本图层（Inter 是 Figma 内置默认字体；中文回退为系统字体，可全选统一替换为思源黑体/HarmonyOS Sans 等）；
   - 渐变、圆角、透明度均保留；选中后可用 Figma「选择所有相似图层」批量改色。
3. 建议在 Figma 中建两页：`Light` / `Dark`，分别拖入对应主题的 SVG。

> 备选：若想从 HTML 原型导入，可在 Figma 安装 **html.to.design** 插件后导入 `preview.html` 页面；但 SVG 路径的图层结构更干净，推荐优先用 SVG。

## 本地预览

```bash
cd design
python -m http.server 4573
# 浏览器打开 http://127.0.0.1:4573/preview.html
```

## 修改与重建

```bash
node design/figma/build.mjs   # 一键重建全部 16 张 SVG
```

- 改颜色/字体：`figma/tokens.mjs`
- 改公共组件（按钮、卡片、侧边栏、图表）：`figma/components.mjs`
- 改某个画面布局：`figma/frames/<画面>.mjs`
