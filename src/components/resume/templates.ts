import type { ResumeTemplateId } from "@/shared/types";

/**
 * 模板 spec：预览（HTML）与导出共享的唯一视觉真源。
 * 借鉴 Reactive Resume 的「内容 × 样式 token 分离」思想（MIT，仅借鉴设计，不复制代码）。
 * V4.2 移植：elegant（双栏侧栏，移植 Reactive-Resume artboard + 猫步简历中文排印思想）
 * 与 timeline（日期右对齐学术式，移植 rendercv 风格）——均为 MIT 项目，仅借鉴布局设计，实现为本项目原创 JSX。
 */
export interface TemplateSpec {
  id: ResumeTemplateId;
  name: string;
  description: string;
  headerAlign: "left" | "center";
  nameCls: string;
  sectionTitleCls: string;
  /** 主色应用位置 */
  accentTarget: "name" | "section" | "both" | "rule" | "none";
  divider: "border" | "accent" | "none";
  bullet: string;
  /** 区块顺序：student 模板教育背景前置 */
  sectionOrder: ("summary" | "skills" | "experience" | "projects" | "education")[];
  /** 布局：单栏（默认）或双栏侧栏 */
  layout: "single" | "sidebar";
  /** sidebar 布局下放入侧栏的区块（其余按 sectionOrder 走主栏）；页眉固定在侧栏顶部 */
  sidebarSections?: ("skills" | "education")[];
}

export const RESUME_TEMPLATES: Record<ResumeTemplateId, TemplateSpec> = {
  classic: {
    id: "classic",
    name: "Classic ATS",
    description: "经典单栏，机器可读性优先",
    headerAlign: "left",
    nameCls: "text-2xl font-bold",
    sectionTitleCls: "text-sm font-bold uppercase tracking-wider",
    accentTarget: "none",
    divider: "border",
    bullet: "•",
    sectionOrder: ["summary", "skills", "experience", "projects", "education"],
    layout: "single",
  },
  modern: {
    id: "modern",
    name: "Modern Tech",
    description: "主色强调 + 现代排印，互联网风格",
    headerAlign: "left",
    nameCls: "text-3xl font-extrabold",
    sectionTitleCls: "text-sm font-bold uppercase tracking-widest",
    accentTarget: "both",
    divider: "accent",
    bullet: "▸",
    sectionOrder: ["summary", "skills", "experience", "projects", "education"],
    layout: "single",
  },
  minimal: {
    id: "minimal",
    name: "Minimal",
    description: "大量留白、细字重、无装饰线",
    headerAlign: "center",
    nameCls: "text-2xl font-medium tracking-widest",
    sectionTitleCls: "text-xs font-medium uppercase tracking-[0.3em] text-slate-500",
    accentTarget: "none",
    divider: "none",
    bullet: "·",
    sectionOrder: ["summary", "experience", "projects", "education", "skills"],
    layout: "single",
  },
  professional: {
    id: "professional",
    name: "Professional",
    description: "居中页眉 + 主色分隔线，传统行业友好",
    headerAlign: "center",
    nameCls: "text-3xl font-bold",
    sectionTitleCls: "text-sm font-bold uppercase tracking-wider",
    accentTarget: "rule",
    divider: "accent",
    bullet: "•",
    sectionOrder: ["summary", "experience", "skills", "projects", "education"],
    layout: "single",
  },
  student: {
    id: "student",
    name: "Student / 应届生",
    description: "教育背景前置，突出校园与项目经历",
    headerAlign: "left",
    nameCls: "text-2xl font-bold",
    sectionTitleCls: "text-sm font-bold uppercase tracking-wider",
    accentTarget: "section",
    divider: "accent",
    bullet: "•",
    sectionOrder: ["education", "experience", "projects", "skills", "summary"],
    layout: "single",
  },
  elegant: {
    id: "elegant",
    name: "Elegant 双栏",
    description: "主色侧栏（页眉/技能/教育）+ 主栏经历，信息分区清晰",
    headerAlign: "left",
    nameCls: "text-2xl font-bold",
    sectionTitleCls: "text-sm font-bold uppercase tracking-wider",
    accentTarget: "section",
    divider: "accent",
    bullet: "▪",
    sectionOrder: ["summary", "experience", "projects"],
    layout: "sidebar",
    sidebarSections: ["skills", "education"],
  },
  timeline: {
    id: "timeline",
    name: "Timeline 学术",
    description: "日期右对齐、经历前置的紧凑学术式",
    headerAlign: "left",
    nameCls: "text-2xl font-bold tracking-wide",
    sectionTitleCls: "text-xs font-bold uppercase tracking-[0.25em]",
    accentTarget: "section",
    divider: "accent",
    bullet: "—",
    sectionOrder: ["experience", "projects", "education", "skills", "summary"],
    layout: "single",
  },
};

export const RESUME_TEMPLATE_LIST = Object.values(RESUME_TEMPLATES);
