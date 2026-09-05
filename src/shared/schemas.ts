import { z } from "zod";
import { APPLICATION_STAGES, RESUME_TEMPLATE_IDS } from "./types";

// —— 简历 ——
export const resumeContentSchema = z.object({
  basics: z
    .object({
      name: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      city: z.string().optional(),
      title: z.string().optional(),
      summary: z.string().optional(),
    })
    .default({}),
  summary: z.string().optional(),
  skills: z.array(z.string()).default([]),
  experience: z
    .array(
      z.object({
        company: z.string(),
        title: z.string(),
        start: z.string().default(""),
        end: z.string().default(""),
        highlights: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  education: z
    .array(
      z.object({
        school: z.string(),
        major: z.string().default(""),
        degree: z.string().default(""),
        start: z.string().default(""),
        end: z.string().default(""),
      }),
    )
    .default([]),
  projects: z
    .array(
      z.object({
        name: z.string(),
        role: z.string().optional(),
        start: z.string().optional(),
        end: z.string().optional(),
        description: z.string().default(""),
        highlights: z.array(z.string()).optional(),
      }),
    )
    .default([]),
});

// —— V3.2：匹配权重向量（用户可调） ——
export const matchWeightsSchema = z.object({
  skills: z.number().min(0).max(10).optional(),
  experience: z.number().min(0).max(10).optional(),
  education: z.number().min(0).max(10).optional(),
  city: z.number().min(0).max(10).optional(),
  salary: z.number().min(0).max(10).optional(),
});

export const profileSchema = z.object({
  expectedPosition: z.string().max(100).nullish(),
  expectedCity: z.string().max(50).nullish(),
  salaryMin: z.number().int().min(0).max(500).nullish(),
  salaryMax: z.number().int().min(0).max(500).nullish(),
  experienceYears: z.number().min(0).max(50).nullish(),
  education: z.string().max(20).nullish(),
  skills: z.array(z.string().max(50)).max(50).nullish(),
  matchWeights: matchWeightsSchema.nullish(),
});

// —— 职位 ——
export const jobSkillSchema = z.object({
  name: z.string(),
  weight: z.number().min(1).max(5).default(3),
});

export const jobStructuredSchema = z.object({
  title: z.string().optional(),
  city: z.string().optional(),
  salaryMin: z.number().optional(),
  salaryMax: z.number().optional(),
  experienceYearsMin: z.number().optional(),
  education: z.string().optional(),
  skills: z.array(jobSkillSchema).default([]),
  responsibilities: z.array(z.string()).default([]),
  requirements: z.array(z.string()).default([]),
});

export const createJobSchema = z.object({
  companyName: z.string().min(1).max(100),
  title: z.string().min(1).max(100),
  city: z.string().max(50).optional(),
  salaryMin: z.number().int().min(0).max(500).optional(),
  salaryMax: z.number().int().min(0).max(500).optional(),
  description: z.string().min(1).max(50000),
  sourceUrl: z.string().max(500).optional(),
  structured: jobStructuredSchema.optional(), // 已解析过则直接带上，否则创建后自动发起解析任务
});

export const updateJobSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  city: z.string().max(50).optional(),
  salaryMin: z.number().int().min(0).max(500).optional(),
  salaryMax: z.number().int().min(0).max(500).optional(),
  status: z.enum(["active", "archived"]).optional(),
});

export const listJobsQuerySchema = z.object({
  keyword: z.string().max(100).optional(),
  favorite: z.enum(["1", "0"]).optional(),
  status: z.enum(["active", "archived", "all"]).default("active"),
  source: z.string().max(30).optional(),
});

// —— V2：来源导入 ——
export const importJobSchema = z.object({
  url: z.string().max(500).optional(),
  text: z.string().max(50000).optional(),
  sourceJobId: z.string().max(100).optional(),
  rawData: z.record(z.string(), z.unknown()).optional(),
});

// —— V2：投递策略 ——
export const deliveryPolicySchema = z.object({
  name: z.string().max(50).optional(),
  cities: z.array(z.string().max(30)).max(20).optional(),
  positions: z.array(z.string().max(30)).max(20).optional(),
  minSalary: z.number().int().min(0).max(500).optional(),
  education: z.string().max(20).optional(),
  maxExperienceYears: z.number().min(0).max(50).optional(),
  companyBlacklist: z.array(z.string().max(50)).max(50).optional(),
  companyWhitelist: z.array(z.string().max(50)).max(50).optional(),
  minMatchScore: z.number().min(0).max(100).optional(),
  acceptInternship: z.boolean().optional(),
  acceptCampus: z.boolean().optional(),
  dailyMaxApplications: z.number().int().min(0).max(200).optional(),
});

export const refreshRecommendationsSchema = z.object({
  resumeId: z.string().optional(),
});

// —— 投递 ——
export const stageSchema = z.enum(APPLICATION_STAGES);

export const createApplicationSchema = z.object({
  jobId: z.string().min(1),
  resumeId: z.string().optional(),
  stage: stageSchema.default("wishlist"),
  notes: z.string().max(2000).optional(),
});

export const stageTransitionSchema = z.object({
  toStage: stageSchema,
  note: z.string().max(500).optional(),
});

export const createReminderSchema = z.object({
  title: z.string().min(1).max(100),
  content: z.string().max(500).optional(),
  remindAt: z.coerce.date(),
  applicationId: z.string().optional(),
});

export const updateApplicationSchema = z.object({
  notes: z.string().max(2000).optional(),
  nextActionAt: z.coerce.date().nullish(),
  resumeId: z.string().nullish(),
});

export const applicationNoteSchema = z.object({
  note: z.string().min(1).max(500),
});

export const listApplicationsQuerySchema = z.object({
  stage: stageSchema.optional(),
});

export const listRemindersQuerySchema = z.object({
  status: z.enum(["pending", "done", "ignored", "all"]).default("all"),
  due: z.enum(["1", "0"]).optional(),
});

export const updateReminderSchema = z.object({
  status: z.enum(["done", "ignored"]),
});

// —— AI 任务 ——
export const parseJdSchema = z.object({
  text: z.string().min(10).max(50000),
});

export const computeMatchSchema = z.object({
  jobId: z.string().min(1),
  resumeId: z.string().min(1),
  useAI: z.boolean().default(false),
});

// —— 认证 ——
export const registerSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(100),
  name: z.string().min(1).max(50),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// —— 简历 ——
export const createResumeSchema = z.object({
  title: z.string().min(1).max(100),
  content: resumeContentSchema.optional(),
});

export const createVersionSchema = z.object({
  content: resumeContentSchema,
  note: z.string().max(200).optional(),
  source: z.enum(["manual", "ai"]).default("manual"),
});

export const optimizeResumeSchema = z.object({
  versionId: z.string().optional(),
  jobTitle: z.string().max(100).optional(),
});

export const tailorResumeSchema = z.object({
  jobId: z.string().min(1),
  versionId: z.string().optional(),
});

// —— V3.1：简历样式 ——
export const resumeStyleSchema = z.object({
  template: z.enum(RESUME_TEMPLATE_IDS),
  font: z.enum(["sans", "serif"]),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  spacing: z.enum(["compact", "normal", "relaxed"]),
});

export const updateResumeSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  isPrimary: z.boolean().optional(),
  style: resumeStyleSchema.optional(),
});

// —— V3.2：AI 设置（用户自带 API Key，key 只写不读；URL 由所选模型自动派生） ——
export const aiSettingsSchema = z.object({
  model: z.string().min(1).max(100),
  apiKey: z.string().min(1).max(300).optional(),
  enabled: z.boolean().optional(),
});

export const aiSettingsTestSchema = z.object({
  model: z.string().min(1).max(100).optional(),
  apiKey: z.string().min(1).max(300).optional(),
});
