// 业务错误码分段：1xxx 通用 / 2xxx 用户 / 3xxx 简历 / 4xxx 职位 / 5xxx 匹配 / 6xxx 投递 / 9xxx AI

export const ErrorCode = {
  // 通用
  VALIDATION: 1001,
  UNAUTHORIZED: 1002,
  FORBIDDEN: 1003,
  NOT_FOUND: 1004,
  CONFLICT: 1005,
  RATE_LIMITED: 1006,
  INTERNAL: 5000,
  // 用户
  EMAIL_EXISTS: 2001,
  INVALID_CREDENTIALS: 2002,
  USER_DISABLED: 2003,
  // 简历
  RESUME_NOT_FOUND: 3001,
  RESUME_VERSION_NOT_FOUND: 3002,
  FILE_PARSE_FAILED: 3003,
  // 职位
  JOB_NOT_FOUND: 4001,
  JOB_PARSE_FAILED: 4002,
  // 匹配
  MATCH_NOT_FOUND: 5001,
  MATCH_EXISTS: 5002,
  // 投递
  APPLICATION_NOT_FOUND: 6001,
  INVALID_STAGE_TRANSITION: 6002,
  APPLICATION_EXISTS: 6003,
  POLICY_REJECTED: 6030,
  REMINDER_NOT_FOUND: 6101,
  // AI
  TASK_NOT_FOUND: 9001,
  TASK_FAILED: 9002,
  AI_LIMIT_EXCEEDED: 9003,
  AI_PROVIDER_ERROR: 9004,
  // 职位来源（V2）
  SOURCE_NOT_FOUND: 7001,
  SOURCE_UNAVAILABLE: 7002,
  IMPORT_INVALID: 7003,
  // Agent（V2）
  AGENT_DRIVER_UNAVAILABLE: 7101,
  AGENT_BLOCKED: 7102,
  AGENT_SESSION_NOT_FOUND: 7103,
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

function httpStatusFor(code: number): number {
  if (code === ErrorCode.UNAUTHORIZED) return 401;
  if (code === ErrorCode.FORBIDDEN) return 403;
  if (
    code === ErrorCode.NOT_FOUND ||
    code === ErrorCode.TASK_NOT_FOUND ||
    code === ErrorCode.RESUME_NOT_FOUND ||
    code === ErrorCode.RESUME_VERSION_NOT_FOUND ||
    code === ErrorCode.JOB_NOT_FOUND ||
    code === ErrorCode.MATCH_NOT_FOUND ||
    code === ErrorCode.APPLICATION_NOT_FOUND ||
    code === ErrorCode.REMINDER_NOT_FOUND ||
    code === ErrorCode.SOURCE_NOT_FOUND ||
    code === ErrorCode.AGENT_SESSION_NOT_FOUND
  ) {
    return 404;
  }
  if (
    code === ErrorCode.CONFLICT ||
    code === ErrorCode.MATCH_EXISTS ||
    code === ErrorCode.APPLICATION_EXISTS
  ) {
    return 409;
  }
  if (code === ErrorCode.POLICY_REJECTED) return 403;
  if (code === ErrorCode.RATE_LIMITED || code === ErrorCode.AI_LIMIT_EXCEEDED) return 429;
  if (code === ErrorCode.INTERNAL) return 500;
  if (code === ErrorCode.SOURCE_UNAVAILABLE || code === ErrorCode.AGENT_DRIVER_UNAVAILABLE) return 503;
  if (code === ErrorCode.INVALID_CREDENTIALS) return 401;
  return 400;
}

export class AppError extends Error {
  readonly code: ErrorCodeValue;
  readonly httpStatus: number;
  readonly details?: unknown;

  constructor(code: ErrorCodeValue, message: string, details?: unknown, httpStatus?: number) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.httpStatus = httpStatus ?? httpStatusFor(code);
    this.details = details;
  }
}
