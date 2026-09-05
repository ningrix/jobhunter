import { NextResponse } from "next/server";

export interface ApiEnvelope<T = unknown> {
  code: number; // 0 = 成功，其余见 shared/errors
  message: string;
  data: T | null;
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ code: 0, message: "ok", data } satisfies ApiEnvelope<T>, { status });
}

export function fail(
  code: number,
  message: string,
  httpStatus?: number,
  details?: unknown,
): NextResponse {
  return NextResponse.json(
    { code, message, data: null, ...(details !== undefined ? { details } : {}) },
    { status: httpStatus ?? (code === 0 ? 200 : 400) },
  );
}
