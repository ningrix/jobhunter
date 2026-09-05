import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import type {
  ResumeContent,
  ResumeStyle,
  JobStructured,
  DimensionScores,
  MatchGap,
  MatchReason,
  MatchExplanation,
  MatchWeights,
  ResumeSuggestion,
  DeliveryPolicyRules,
} from "@/shared/types";

const now = () => new Date();
const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now);
const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(now)
    .$onUpdateFn(() => new Date());

// ———— 用户域 ————

export const users = sqliteTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("active"), // active | disabled
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

export const userProfiles = sqliteTable("user_profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  expectedPosition: text("expected_position"),
  expectedCity: text("expected_city"),
  salaryMin: integer("salary_min"), // K/月
  salaryMax: integer("salary_max"),
  experienceYears: real("experience_years"),
  education: text("education"),
  skills: text("skills", { mode: "json" }).$type<string[]>().notNull().default([]),
  /** 匹配权重向量（用户可调，0-10；null = 系统默认权重） */
  matchWeights: text("match_weights", { mode: "json" }).$type<MatchWeights>(),
  updatedAt: updatedAt(),
});

export const refreshTokens = sqliteTable(
  "refresh_tokens",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("refresh_tokens_hash_uq").on(t.tokenHash)],
);

// ———— 文件 ————

export const files = sqliteTable("files", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  path: text("path").notNull(), // 相对 data/ 目录
  createdAt: createdAt(),
});

// ———— 简历域 ————

export const resumes = sqliteTable(
  "resumes",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
    status: text("status").notNull().default("active"),
    /** V3.1 简历视觉样式（模板/字体/主色/间距），随简历共享给全部版本 */
    style: text("style", { mode: "json" }).$type<ResumeStyle>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("resumes_user_idx").on(t.userId)],
);

export const resumeVersions = sqliteTable(
  "resume_versions",
  {
    id: id(),
    resumeId: text("resume_id")
      .notNull()
      .references(() => resumes.id, { onDelete: "cascade" }),
    versionNo: integer("version_no").notNull(),
    content: text("content", { mode: "json" }).$type<ResumeContent>().notNull(),
    source: text("source").notNull().default("manual"), // manual | upload | ai
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("resume_versions_resume_idx").on(t.resumeId)],
);

export const resumeFiles = sqliteTable("resume_files", {
  id: id(),
  resumeId: text("resume_id")
    .notNull()
    .references(() => resumes.id, { onDelete: "cascade" }),
  fileId: text("file_id")
    .notNull()
    .references(() => files.id, { onDelete: "cascade" }),
  parseStatus: text("parse_status").notNull().default("pending"), // pending | done | failed
  parseError: text("parse_error"),
  createdAt: createdAt(),
});

export const resumeAnalyses = sqliteTable(
  "resume_analyses",
  {
    id: id(),
    resumeId: text("resume_id")
      .notNull()
      .references(() => resumes.id, { onDelete: "cascade" }),
    versionId: text("version_id")
      .notNull()
      .references(() => resumeVersions.id, { onDelete: "cascade" }),
    taskId: text("task_id"),
    score: integer("score").notNull(),
    issues: text("issues", { mode: "json" }).$type<string[]>().notNull().default([]),
    suggestions: text("suggestions", { mode: "json" })
      .$type<ResumeSuggestion[]>()
      .notNull()
      .default([]),
    createdAt: createdAt(),
  },
  (t) => [index("resume_analyses_resume_idx").on(t.resumeId)],
);

// ———— 职位域 ————

export const companies = sqliteTable(
  "companies",
  {
    id: id(),
    name: text("name").notNull(),
    industry: text("industry"),
    size: text("size"),
    description: text("description"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("companies_name_uq").on(t.name)],
);

export const jobs = sqliteTable(
  "jobs",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: text("company_id").references(() => companies.id, { onDelete: "set null" }),
    companyName: text("company_name").notNull(),
    title: text("title").notNull(),
    city: text("city"),
    district: text("district"),
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    description: text("description").notNull(), // 原始 JD 全文
    structured: text("structured", { mode: "json" }).$type<JobStructured>(),
    source: text("source").notNull().default("manual"), // manual | paste | boss | mock | ...
    sourceJobId: text("source_job_id"), // 来源平台职位 ID
    sourceUrl: text("source_url"),
    employmentType: text("employment_type"), // 全职 | 实习 | 兼职
    jobType: text("job_type"), // 社招 | 校招
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
    postedAt: integer("posted_at", { mode: "timestamp_ms" }),
    rawData: text("raw_data", { mode: "json" }).$type<Record<string, unknown>>(),
    fingerprint: text("fingerprint"), // 规范化内容指纹（跨来源去重）
    status: text("status").notNull().default("active"), // active | archived
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    index("jobs_user_idx").on(t.userId),
    index("jobs_user_fingerprint_idx").on(t.userId, t.fingerprint),
    uniqueIndex("jobs_user_source_uq").on(t.userId, t.source, t.sourceJobId),
  ],
);

export const jobFavorites = sqliteTable(
  "job_favorites",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("job_favorites_uq").on(t.userId, t.jobId)],
);

// ———— 匹配域 ————

export const jobMatches = sqliteTable(
  "job_matches",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    resumeId: text("resume_id")
      .notNull()
      .references(() => resumes.id, { onDelete: "cascade" }),
    totalScore: real("total_score").notNull(),
    dimensionScores: text("dimension_scores", { mode: "json" })
      .$type<DimensionScores>()
      .notNull(),
    gaps: text("gaps", { mode: "json" }).$type<MatchGap[]>().notNull().default([]),
    reasons: text("reasons", { mode: "json" }).$type<MatchReason[]>().notNull().default([]),
    summary: text("summary"),
    aiExplanation: text("ai_explanation", { mode: "json" }).$type<MatchExplanation>(),
    taskId: text("task_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("job_matches_uq").on(t.userId, t.jobId, t.resumeId)],
);

export const embeddings = sqliteTable(
  "embeddings",
  {
    id: id(),
    ownerType: text("owner_type").notNull(), // resume | job
    ownerId: text("owner_id").notNull(),
    chunk: text("chunk").notNull(),
    dim: integer("dim").notNull(),
    vector: text("vector", { mode: "json" }).$type<number[]>().notNull(),
    model: text("model").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("embeddings_owner_idx").on(t.ownerType, t.ownerId)],
);

// ———— 投递域 ————

export const applications = sqliteTable(
  "applications",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    resumeId: text("resume_id").references(() => resumes.id, { onDelete: "set null" }),
    stage: text("stage").notNull().default("wishlist"),
    appliedAt: integer("applied_at", { mode: "timestamp_ms" }),
    nextActionAt: integer("next_action_at", { mode: "timestamp_ms" }),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("applications_uq").on(t.userId, t.jobId)],
);

export const applicationEvents = sqliteTable(
  "application_events",
  {
    id: id(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // created | stage_change | note
    fromStage: text("from_stage"),
    toStage: text("to_stage"),
    note: text("note"),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
  },
  (t) => [index("application_events_app_idx").on(t.applicationId)],
);

export const reminders = sqliteTable(
  "reminders",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    applicationId: text("application_id").references(() => applications.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    content: text("content"),
    remindAt: integer("remind_at", { mode: "timestamp_ms" }).notNull(),
    status: text("status").notNull().default("pending"), // pending | done | ignored
    doneAt: integer("done_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("reminders_user_idx").on(t.userId, t.remindAt)],
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    content: text("content"),
    isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId)],
);

// ———— V2：投递策略与 Agent 审计 ————

/** 投递策略（每用户一份默认策略，规则见 DeliveryPolicyRules） */
export const applicationPolicies = sqliteTable(
  "application_policies",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("默认投递策略"),
    rules: text("rules", { mode: "json" }).$type<DeliveryPolicyRules>().notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("application_policies_user_uq").on(t.userId)],
);

/** Agent/导入等自动化行为的审计日志：每一步动作均落库，支撑漏斗与问题排查 */
export const agentEvents = sqliteTable(
  "agent_events",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),
    applicationId: text("application_id").references(() => applications.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(), // import | open_page | extract_jd | policy_check | generate_content | fill_form | wait_user_confirm | submit | blocked
    source: text("source"),
    result: text("result").notNull(), // success | failed | blocked | waiting_user
    detail: text("detail", { mode: "json" }).$type<Record<string, unknown>>(),
    error: text("error"),
    userConfirmed: integer("user_confirmed", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index("agent_events_user_idx").on(t.userId, t.createdAt),
    index("agent_events_session_idx").on(t.sessionId),
  ],
);

// ———— AI 域 ————

export const aiTasks = sqliteTable(
  "ai_tasks",
  {
    id: id(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    status: text("status").notNull().default("queued"), // queued | running | succeeded | failed
    input: text("input", { mode: "json" }).$type<Record<string, unknown>>(),
    output: text("output", { mode: "json" }).$type<Record<string, unknown>>(),
    error: text("error"),
    provider: text("provider"),
    model: text("model"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    durationMs: integer("duration_ms"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ai_tasks_user_idx").on(t.userId, t.createdAt)],
);

export const aiUsageLogs = sqliteTable(
  "ai_usage_logs",
  {
    id: id(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    taskId: text("task_id"),
    scene: text("scene").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    cost: real("cost").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("ai_usage_user_idx").on(t.userId, t.createdAt)],
);

/** 用户自带 AI 凭据（每用户一份）：API Key 经 AES-256-GCM 加密落库，任何接口不回明文 */
export const aiSettings = sqliteTable(
  "ai_settings",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("openai-compat"), // openai 兼容协议（GLM/DeepSeek/Kimi 等）
    baseUrl: text("base_url").notNull(),
    apiKeyEnc: text("api_key_enc").notNull(),
    model: text("model").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("ai_settings_user_uq").on(t.userId)],
);
