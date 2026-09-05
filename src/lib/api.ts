import type { NextRequest, NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AppError, ErrorCode } from "@/shared/errors";
import { fail } from "@/shared/response";
import { getSessionUser, type SessionUser } from "./auth";

export interface RouteContext<B, Q> {
  req: NextRequest;
  user: SessionUser | null;
  body: B;
  query: Q;
  params: Record<string, string>;
}

interface RouteOptions<B, Q> {
  auth?: boolean;
  body?: ZodType<B>;
  query?: ZodType<Q>;
}

type RouteHandler<B, Q> = (ctx: RouteContext<B, Q>) => Promise<NextResponse> | NextResponse;

/**
 * 路由包装器：鉴权 → zod 校验 → 业务执行 → 统一错误映射。
 * 同时兼容静态路由与动态路由（params 为 Promise）。
 */
export function defineRoute<B = undefined, Q = undefined>(
  opts: RouteOptions<B, Q>,
  handler: RouteHandler<B, Q>,
) {
  return async (
    req: NextRequest,
    routeCtx: { params: Promise<Record<string, string>> },
  ): Promise<NextResponse> => {
    try {
      const user = await getSessionUser(req);
      if (opts.auth && !user) {
        return fail(ErrorCode.UNAUTHORIZED, "未登录或登录已过期", 401);
      }

      let body = undefined as B;
      if (opts.body) {
        const raw = await req.json().catch(() => {
          throw new AppError(ErrorCode.VALIDATION, "请求体必须是合法 JSON");
        });
        body = opts.body.parse(raw);
      }

      let query = undefined as Q;
      if (opts.query) {
        const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
        query = opts.query.parse(sp);
      }

      const params = await routeCtx.params;
      return await handler({ req, user, body, query, params });
    } catch (err) {
      if (err instanceof ZodError) {
        return fail(
          ErrorCode.VALIDATION,
          "参数校验失败",
          400,
          err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        );
      }
      if (err instanceof AppError) {
        return fail(err.code, err.message, err.httpStatus, err.details);
      }
      console.error("[api] unhandled error:", err);
      return fail(ErrorCode.INTERNAL, "服务器内部错误", 500);
    }
  };
}
