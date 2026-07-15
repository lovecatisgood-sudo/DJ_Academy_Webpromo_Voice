import { NextResponse } from "next/server";

export function apiError(code: string, message: string, status = 400, details?: unknown) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details })
      }
    },
    { status }
  );
}

export function apiJson<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}
