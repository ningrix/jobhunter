import { AppError, ErrorCode } from "@/shared/errors";
import type { BrowserDriver, DriverFormField, DriverPage } from "../types";

export interface MockSiteScenario {
  jobUrl: string;
  /** 模拟「平台要求登录」：Agent 必须停止并告知用户 */
  loginRequired?: boolean;
  /** 模拟「点击申请后弹出安全验证」：Agent 必须停止 */
  captchaOnApply?: boolean;
  /** 验证码出现次数上限（默认 1；>1 时复检通过后再次点击申请会再次弹出，模拟平台反复风控） */
  captchaRounds?: number;
  /** 模拟「用户完成验证后平台仍停留在验证页」（用户未真正通过） */
  captchaSticky?: boolean;
  job: { title: string; companyName: string; description: string; city?: string };
  formFields: DriverFormField[];
}

/**
 * 模拟浏览器驱动：以状态机模拟一个最小招聘站，
 * 用于 CI 测试与产品演示，不访问任何真实网站。
 */
export class MockBrowserDriver implements BrowserDriver {
  readonly name = "mock";
  private page: DriverPage;
  private readonly filled = new Map<string, string>();
  private captchaHits = 0;

  constructor(private readonly scenario: MockSiteScenario) {
    this.page = { url: scenario.jobUrl, kind: "not_found" };
  }

  private get captchaRounds(): number {
    return this.scenario.captchaRounds ?? 1;
  }

  async open(url: string): Promise<DriverPage> {
    if (url !== this.scenario.jobUrl) {
      this.page = { url, kind: "not_found" };
      return this.page;
    }
    if (this.scenario.loginRequired) {
      this.page = { url, kind: "login_wall" };
      return this.page;
    }
    this.page = { url, kind: "job_detail" };
    return this.page;
  }

  currentPage(): DriverPage {
    return this.page;
  }

  async clickApply(): Promise<DriverPage> {
    if (this.page.kind !== "job_detail") {
      throw new AppError(ErrorCode.AGENT_BLOCKED, `当前页面无法申请（${this.page.kind}）`);
    }
    if (this.scenario.captchaOnApply && this.captchaHits < this.captchaRounds) {
      this.captchaHits += 1;
      this.page = { url: this.page.url, kind: "captcha" };
      return this.page;
    }
    this.page = { url: `${this.page.url}#apply`, kind: "apply_form" };
    return this.page;
  }

  /**
   * 模拟用户在平台上完成滑块/验证码后的页面状态：
   * sticky 场景表示仍未通过（保持验证页）；
   * 若还会再次弹出（captchaHits < captchaRounds）则回到职位页，由流程重新点击申请。
   */
  async resolveCaptcha(): Promise<DriverPage> {
    if (this.page.kind !== "captcha") {
      throw new AppError(ErrorCode.AGENT_BLOCKED, "当前不在安全验证页");
    }
    if (this.scenario.captchaSticky) {
      return this.page;
    }
    if (this.captchaHits < this.captchaRounds) {
      this.page = { url: this.page.url, kind: "job_detail" };
      return this.page;
    }
    this.page = { url: `${this.page.url}#apply`, kind: "apply_form" };
    return this.page;
  }

  async extractJob() {
    if (this.page.kind !== "job_detail") {
      throw new AppError(ErrorCode.AGENT_BLOCKED, "当前不在职位详情页");
    }
    return this.scenario.job;
  }

  async readForm(): Promise<DriverFormField[]> {
    if (this.page.kind !== "apply_form") {
      throw new AppError(ErrorCode.AGENT_BLOCKED, "当前不在申请表单页");
    }
    return this.scenario.formFields;
  }

  async fillForm(values: Record<string, string>) {
    if (this.page.kind !== "apply_form") {
      throw new AppError(ErrorCode.AGENT_BLOCKED, "当前不在申请表单页");
    }
    const filled: string[] = [];
    const missing: string[] = [];
    for (const field of this.scenario.formFields) {
      const v = values[field.name];
      if (v !== undefined && v !== "") {
        this.filled.set(field.name, v);
        filled.push(field.name);
      } else if (field.required) {
        missing.push(field.name);
      }
    }
    if (missing.length > 0) {
      throw new AppError(ErrorCode.AGENT_BLOCKED, `必填字段未填写: ${missing.join("、")}`, {
        filled,
        missing,
      });
    }
    return { filled, missing };
  }

  async submit() {
    if (this.page.kind !== "apply_form") {
      throw new AppError(ErrorCode.AGENT_BLOCKED, "当前不在申请表单页");
    }
    return { ok: true, message: "已通过模拟站点提交" };
  }

  async close(): Promise<void> {
    /* 模拟驱动无需清理 */
  }
}
