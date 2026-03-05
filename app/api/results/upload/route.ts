export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

const RESULTS_PATH = "results/latest.json";

export async function POST(request: NextRequest) {
  const secret = process.env.UPLOAD_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "UPLOAD_SECRET 환경변수가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  const provided =
    request.headers.get("upload_secret") ??
    request.headers.get("UPLOAD_SECRET") ??
    "";

  if (provided !== secret) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "JSON 파싱 실패: " + message },
      { status: 400 }
    );
  }

  try {
    const json = JSON.stringify(body);
    const blob = await put(RESULTS_PATH, json, {
      access: "private",
      contentType: "application/json; charset=utf-8",
      addRandomSuffix: false,
    });

    return NextResponse.json(
      {
        ok: true,
        path: blob.pathname,
        size: json.length,
        uploadedAt: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (e) {
    console.error("results/upload error:", e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "업로드 중 오류: " + message },
      { status: 500 }
    );
  }
}

