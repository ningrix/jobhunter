/**
 * 浏览器驱动抽象：Agent 的所有页面操作都经由此接口。
 *
 * 安全边界（见 docs/11-agent-security）：
 * - 驱动必须如实上报登录墙 / 验证码页，调用方（流程层）遇到即停止，绝不尝试绕过
 * - 驱动不接触、不传输任何平台账号凭证
 * - 真实浏览器驱动（本地用户浏览器 + 已登录会话）为后续扩展，默认不启用
 */

export type DriverPageKind =
  | "login_wall" // 平台要求登录（用户需在自己浏览器登录）
  | "job_detail"
  | "apply_form"
  | "captcha" // 平台安全验证（人工处理）
  | "result"
  | "not_found";

export interface DriverPage {
  url: string;
  kind: DriverPageKind;
}

export interface ExtractedJob {
  title?: string;
  companyName?: string;
  description?: string;
  city?: string;
}

export interface DriverFormField {
  name: string;
  label: string;
  type: "text" | "textarea" | "file";
  required: boolean;
}

export interface BrowserDriver {
  readonly name: string;
  /** 打开页面；遇到登录墙/验证码页必须如实返回，不得绕过 */
  open(url: string): Promise<DriverPage>;
  currentPage(): DriverPage;
  /** 职位详情页上的主 CTA（立即沟通/申请）；可能到达 apply_form 或 captcha 页 */
  clickApply(): Promise<DriverPage>;
  /** 从当前 job_detail 页提取职位信息 */
  extractJob(): Promise<ExtractedJob>;
  readForm(): Promise<DriverFormField[]>;
  fillForm(values: Record<string, string>): Promise<{ filled: string[]; missing: string[] }>;
  /** 提交表单；调用前流程层必须已完成用户确认 */
  submit(): Promise<{ ok: boolean; message: string }>;
  /**
   * 用户声称已在平台完成安全验证（滑块/验证码）后的复检：
   * 返回当前真实页面。仍是 captcha 表示验证未通过；绝不代替用户完成验证。
   */
  resolveCaptcha?(): Promise<DriverPage>;
  screenshot?(): Promise<string | null>;
  close(): Promise<void>;
}
