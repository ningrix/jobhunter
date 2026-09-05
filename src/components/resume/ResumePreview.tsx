"use client";

import type { ResumeContent, ResumeStyle } from "@/shared/types";
import { RESUME_TEMPLATES } from "./templates";

const SECTION_GAP = { compact: "space-y-2", normal: "space-y-4", relaxed: "space-y-6" };
const ITEM_GAP = { compact: "space-y-1.5", normal: "space-y-2.5", relaxed: "space-y-3.5" };

function safeAccent(color: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#1e40af";
}

/**
 * 简历实时预览（A4）：Input → Resume State → Renderer → Preview。
 * 与导出共享同一份模板 spec（内容与区块顺序一致）。
 */
export function ResumePreview({
  content,
  style,
}: {
  content: ResumeContent;
  style: ResumeStyle;
}) {
  const spec = RESUME_TEMPLATES[style.template] ?? RESUME_TEMPLATES.classic;
  const accent = safeAccent(style.accentColor);
  const fontCls = style.font === "serif" ? "font-serif" : "font-sans";

  const name = content.basics.name || "姓名";
  const contactLine = [content.basics.phone, content.basics.email, content.basics.city]
    .filter(Boolean)
    .join("  ·  ");
  const titleLine = content.basics.title;

  const dividerCls =
    spec.divider === "accent"
      ? "border-b-2 pb-1"
      : spec.divider === "border"
        ? "border-b border-slate-300 pb-1"
        : "";
  const sectionTitleStyle =
    spec.accentTarget === "section" || spec.accentTarget === "both"
      ? { color: accent, borderColor: accent }
      : undefined;

  const summary = content.summary || content.basics.summary;
  const sections: Record<TemplateSpecSection, { title: string; body: React.ReactNode } | null> = {
    summary: summary
      ? {
          title: "个人优势",
          body: <p className="text-[13px] leading-relaxed text-slate-700">{summary}</p>,
        }
      : null,
    skills:
      content.skills.length > 0
        ? {
            title: "专业技能",
            body: (
              <p className="text-[13px] leading-relaxed text-slate-700">
                {content.skills.join("  ·  ")}
              </p>
            ),
          }
        : null,
    experience:
      content.experience.length > 0
        ? {
            title: "工作经历",
            body: (
              <div className={ITEM_GAP[style.spacing]}>
                {content.experience.map((e, i) => (
                  <div key={i}>
                    <div className="flex items-baseline justify-between">
                      <p className="text-[13px] font-semibold text-slate-800">
                        {e.company}
                        {e.title && <span className="ml-2 font-normal text-slate-500">{e.title}</span>}
                      </p>
                      <p className="text-xs text-slate-400">
                        {[e.start, e.end].filter(Boolean).join(" - ")}
                      </p>
                    </div>
                    {e.highlights.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {e.highlights.map((h, j) => (
                          <li key={j} className="flex gap-1.5 text-[12.5px] leading-relaxed text-slate-600">
                            <span style={spec.accentTarget !== "none" ? { color: accent } : undefined}>
                              {spec.bullet}
                            </span>
                            <span>{h}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            ),
          }
        : null,
    projects:
      content.projects.length > 0
        ? {
            title: "项目经历",
            body: (
              <div className={ITEM_GAP[style.spacing]}>
                {content.projects.map((p, i) => (
                  <div key={i}>
                    <div className="flex items-baseline justify-between">
                      <p className="text-[13px] font-semibold text-slate-800">
                        {p.name}
                        {p.role && <span className="ml-2 font-normal text-slate-500">{p.role}</span>}
                      </p>
                      <p className="text-xs text-slate-400">
                        {[p.start, p.end].filter(Boolean).join(" - ")}
                      </p>
                    </div>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-600">{p.description}</p>
                    {(p.highlights ?? []).length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {(p.highlights ?? []).map((h, j) => (
                          <li key={j} className="flex gap-1.5 text-[12.5px] text-slate-600">
                            <span style={spec.accentTarget !== "none" ? { color: accent } : undefined}>
                              {spec.bullet}
                            </span>
                            <span>{h}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            ),
          }
        : null,
    education:
      content.education.length > 0
        ? {
            title: "教育背景",
            body: (
              <div className={ITEM_GAP[style.spacing]}>
                {content.education.map((e, i) => (
                  <div key={i} className="flex items-baseline justify-between">
                    <p className="text-[13px] font-semibold text-slate-800">
                      {e.school}
                      <span className="ml-2 font-normal text-slate-500">
                        {[e.major, e.degree].filter(Boolean).join(" · ")}
                      </span>
                    </p>
                    <p className="text-xs text-slate-400">{[e.start, e.end].filter(Boolean).join(" - ")}</p>
                  </div>
                ))}
              </div>
            ),
          }
        : null,
  };

  const headerAccent = spec.accentTarget === "name" || spec.accentTarget === "both" ? accent : undefined;

  return (
    <div
      id="resume-print-root"
      className={`${fontCls} bg-white text-slate-900`}
      style={{ width: 794, minHeight: 1123, padding: 48 }}
    >
      {/* 页眉 */}
      <div className={spec.headerAlign === "center" ? "text-center" : ""}>
        <p className={spec.nameCls} style={{ color: headerAccent }}>
          {name}
        </p>
        {titleLine && <p className="mt-0.5 text-[13px] font-medium text-slate-600">{titleLine}</p>}
        {contactLine && <p className="mt-1 text-xs text-slate-500">{contactLine}</p>}
        {spec.accentTarget === "rule" && (
          <div className="mt-3 h-0.5 w-full" style={{ backgroundColor: accent }} />
        )}
        {spec.accentTarget !== "rule" && <div className="mt-3" />}
      </div>

      {/* 区块（按模板顺序，跳过空区块） */}
      <div className={SECTION_GAP[style.spacing]}>
        {spec.sectionOrder.map((key) => {
          const section = sections[key as TemplateSpecSection];
          if (!section) return null;
          return (
            <section key={key}>
              <h2
                className={`${spec.sectionTitleCls} ${dividerCls}`}
                style={sectionTitleStyle}
              >
                {section.title}
              </h2>
              <div className="mt-2">{section.body}</div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

type TemplateSpecSection = "summary" | "skills" | "experience" | "projects" | "education";
