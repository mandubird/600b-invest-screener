export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { list } from "@vercel/blob";

const RESULTS_PATH = "results/latest.json";

export async function GET() {
  try {
    const { blobs } = await list({ prefix: RESULTS_PATH });
    if (!blobs.length) {
      return NextResponse.json(
        {
          error:
            "오늘 데이터가 아직 업로드되지 않았습니다. 로컬 스크립트(screener_upload.py)로 업로드한 뒤 다시 시도하세요.",
        },
        { status: 404 }
      );
    }

    const latest = blobs[0];
    const res = await fetch(latest.url);
    const data = await res.json();

    return NextResponse.json(data, { status: 200 });
  } catch (e) {
    console.error("results/latest error:", e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "결과 조회 중 오류: " + message },
      { status: 500 }
    );
  }
}

