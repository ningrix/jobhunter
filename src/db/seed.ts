/**
 * 演示数据种子脚本：npm run db:seed
 * 幂等：demo 用户已存在则跳过。
 */
try {
  process.loadEnvFile();
} catch {
  /* 无 .env 时使用默认值 */
}

import { eq } from "drizzle-orm";
import { getDb } from "./client";
import {
  companies,
  jobFavorites,
  jobs as jobsTable,
  resumes as resumesTable,
  users,
} from "./schema";
import type { ResumeContent } from "@/shared/types";
import { registerUser } from "@/server/core/auth-service";
import { createResume } from "@/server/core/resume-service";
import { createJob, type CreateJobInput } from "@/server/core/job-service";
import { computeMatch } from "@/server/core/match-service";
import { createApplication, transitionStage } from "@/server/core/application-service";
import { createReminder } from "@/server/core/reminder-service";
import { updateProfile } from "@/server/core/user-service";

const DEMO_EMAIL = "demo@jobhunter.cn";

const RESUME: ResumeContent = {
  basics: {
    name: "李晓阳",
    phone: "13800138000",
    email: DEMO_EMAIL,
    city: "上海",
    title: "前端工程师",
    summary: "5 年前端开发经验",
  },
  summary: "5 年互联网前端开发经验，主导过日活百万级 C 端项目的性能优化与工程化建设，熟悉 React 技术栈与 Node.js 服务端开发。",
  skills: ["React", "TypeScript", "Next.js", "Node.js", "Webpack", "Vite", "性能优化"],
  experience: [
    {
      company: "星辰科技",
      title: "高级前端工程师",
      start: "2022-03",
      end: "至今",
      highlights: [
        "主导营销活动页低代码平台建设，活动上线周期从 3 天缩短到 2 小时",
        "核心页面首屏加载从 3.2s 优化到 1.1s，转化率提升 8%",
        "搭建前端监控体系，线上问题平均定位时间从 2 小时降至 15 分钟",
      ],
    },
    {
      company: "云帆网络",
      title: "前端工程师",
      start: "2019-07",
      end: "2022-02",
      highlights: [
        "负责 SaaS 控制台前端架构升级，从 Vue2 迁移到 React + TypeScript",
        "封装 30+ 通用业务组件，团队复用率超过 70%",
      ],
    },
  ],
  education: [{ school: "华东理工大学", major: "软件工程", degree: "本科", start: "2015", end: "2019" }],
  projects: [
    {
      name: "开源组件库 lh-ui",
      role: "发起人",
      start: "2023-01",
      end: "至今",
      description: "基于 React + TypeScript 的企业级组件库，GitHub 1.2k Star",
      highlights: ["周下载量 8000+", "贡献者 20+"],
    },
  ],
};

const JOB_INPUTS: (CreateJobInput & { favorite?: boolean })[] = [
  {
    companyName: "字节跳动",
    title: "资深前端工程师（电商）",
    city: "上海",
    salaryMin: 25,
    salaryMax: 40,
    description:
      "负责电商核心链路的前端开发与架构优化，要求精通 React、TypeScript，有大型 C 端项目性能优化经验，5 年以上前端经验，本科及以上学历。",
    favorite: true,
    structured: {
      title: "资深前端工程师（电商）",
      city: "上海",
      salaryMin: 25,
      salaryMax: 40,
      experienceYearsMin: 5,
      education: "本科",
      skills: [
        { name: "React", weight: 5 },
        { name: "TypeScript", weight: 5 },
        { name: "性能优化", weight: 4 },
        { name: "Node.js", weight: 3 },
      ],
      responsibilities: ["负责电商核心链路前端开发", "主导性能优化专项"],
      requirements: ["5 年以上前端经验", "精通 React 技术栈"],
    },
  },
  {
    companyName: "小红书",
    title: "前端工程师（社区）",
    city: "上海",
    salaryMin: 20,
    salaryMax: 35,
    description:
      "参与社区互动方向前端开发，3 年以上经验，熟悉 React 或 Vue，有跨端经验优先。",
    structured: {
      title: "前端工程师（社区）",
      city: "上海",
      salaryMin: 20,
      salaryMax: 35,
      experienceYearsMin: 3,
      education: "本科",
      skills: [
        { name: "React", weight: 5 },
        { name: "Vue", weight: 3 },
      ],
      responsibilities: ["社区互动方向需求迭代"],
      requirements: ["3 年以上经验", "熟悉 React 或 Vue"],
    },
  },
  {
    companyName: "米哈游",
    title: "Web 前端工程师",
    city: "上海",
    salaryMin: 18,
    salaryMax: 30,
    description: "负责玩家社区与官网开发，熟悉 React、Node.js，关注体验与性能。",
    structured: {
      title: "Web 前端工程师",
      city: "上海",
      salaryMin: 18,
      salaryMax: 30,
      experienceYearsMin: 2,
      education: "不限",
      skills: [
        { name: "React", weight: 4 },
        { name: "Node.js", weight: 3 },
      ],
      responsibilities: ["玩家社区与官网开发"],
      requirements: ["熟悉 React、Node.js"],
    },
  },
  {
    companyName: "拼多多",
    title: "高级 Java 工程师",
    city: "上海",
    salaryMin: 25,
    salaryMax: 45,
    description: "负责交易后端服务开发，要求精通 Java、Spring Boot、MySQL，有高并发经验。",
    structured: {
      title: "高级 Java 工程师",
      city: "上海",
      salaryMin: 25,
      salaryMax: 45,
      experienceYearsMin: 4,
      education: "本科",
      skills: [
        { name: "Java", weight: 5 },
        { name: "Spring Boot", weight: 5 },
        { name: "MySQL", weight: 4 },
      ],
      responsibilities: ["交易后端服务开发"],
      requirements: ["精通 Java 技术栈", "高并发经验"],
    },
  },
];

async function main() {
  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, DEMO_EMAIL)).limit(1);
  if (existing) {
    console.log(`演示数据已存在（${DEMO_EMAIL}），跳过。`);
    return;
  }

  const user = await registerUser({
    email: DEMO_EMAIL,
    password: "demo12345",
    name: "李晓阳",
  });
  await updateProfile(user.id, {
    expectedPosition: "前端工程师",
    expectedCity: "上海",
    salaryMin: 20,
    salaryMax: 35,
    experienceYears: 5,
    education: "本科",
    skills: RESUME.skills,
  });

  const { resume } = await createResume(user.id, { title: "前端主简历", content: RESUME });
  await db.update(resumesTable).set({ isPrimary: true }).where(eq(resumesTable.id, resume.id));

  const jobIds: string[] = [];
  for (const input of JOB_INPUTS) {
    const { favorite, ...rest } = input;
    const { job } = await createJob(user.id, rest);
    jobIds.push(job.id);
    if (favorite) {
      await db
        .insert(jobFavorites)
        .values({ userId: user.id, jobId: job.id })
        .onConflictDoNothing();
    }
  }
  await db
    .update(jobsTable)
    .set({ status: "active" })
    .where(eq(jobsTable.userId, user.id));
  await db
    .update(companies)
    .set({ industry: "互联网", size: "10000 人以上" })
    .where(eq(companies.name, "字节跳动"));

  // 匹配：主简历 × 三个前端岗
  for (const jobId of jobIds.slice(0, 3)) {
    await computeMatch(user.id, { jobId, resumeId: resume.id, useAI: true });
  }

  // 投递流水线：字节 → 面试；小红书 → 已投递；米哈游 → 想投；拼多多（Java 岗不投，仅收藏）
  const app1 = await createApplication(user.id, {
    jobId: jobIds[0],
    resumeId: resume.id,
    notes: "内推，走快车道",
  });
  await transitionStage(user.id, app1.id, "applied", "官网投递完成");
  await transitionStage(user.id, app1.id, "written_test", "通过简历筛选，收到笔试邀请");
  await transitionStage(user.id, app1.id, "interview", "笔试通过，约一面");

  const app2 = await createApplication(user.id, { jobId: jobIds[1], resumeId: resume.id });
  await transitionStage(user.id, app2.id, "applied", "BOSS 直聘沟通后投递");

  await createApplication(user.id, { jobId: jobIds[2], resumeId: resume.id });

  // 提醒：一条已到期、一条未来
  await createReminder(user.id, {
    title: "准备字节一面复盘",
    content: "整理电商业务的理解与性能优化案例",
    remindAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    applicationId: app1.id,
  });
  await createReminder(user.id, {
    title: "跟进小红书 HR",
    content: "投递已 3 天，发消息跟进进度",
    remindAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    applicationId: app2.id,
  });

  console.log("✅ 演示数据就绪");
  console.log("   登录邮箱: demo@jobhunter.cn");
  console.log("   登录密码: demo12345");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
