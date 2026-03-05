export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

type CachedItem = {
  ticker: string;
  name: string;
  price: number;
  mktcap: number;
  volume: number;
  low52w: number;
  psr: number;
  ncr: number;
  ma20: number | null;
  ma60: number | null;
  ma120: number | null;
};

const REDIS_URL = process.env.REDIS_URL;

async function redisGetJSON<T>(key: string): Promise<T | null> {
  if (!REDIS_URL) {
    throw new Error("REDIS_URL 환경변수가 설정되지 않았습니다.");
  }
  const encodedKey = encodeURIComponent(key);
  const url = `${REDIS_URL}/get/${encodedKey}`;
  const res = await fetch(url);
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // ignore JSON parse errors
  }
  if (!res.ok) {
    throw new Error(`Upstash Redis get 실패: ${res.statusText || res.status}`);
  }
  const raw = data?.result;
  if (raw == null) return null;
  try {
    const decoded = decodeURIComponent(String(raw));
    return JSON.parse(decoded) as T;
  } catch {
    throw new Error("Upstash Redis 값 JSON 파싱 실패");
  }
}

export async function POST(request: NextRequest) {
  const key = process.env.DART_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "DART_API_KEY가 설정되지 않았습니다. Vercel 환경변수를 설정하세요." },
      { status: 500 }
    );
  }

  let filters = {
    psr_max: 0.4,
    cash_min: 0.1,
    volume_min: 100,
    mktcap_min: 50,
    low52w_pct: 20,
    ma_below: true,
  };

  // 요청 바디 파싱 (실패 시 400으로 구체적인 에러 반환)
  try {
    const body = await request.json();
    if (body.psr_max != null) filters.psr_max = Number(body.psr_max);
    if (body.cash_min != null) filters.cash_min = Number(body.cash_min);
    if (body.volume_min != null) filters.volume_min = Number(body.volume_min);
    if (body.mktcap_min != null) filters.mktcap_min = Number(body.mktcap_min);
    if (body.low52w_pct != null) filters.low52w_pct = Number(body.low52w_pct);
    if (body.ma_below != null) filters.ma_below = Boolean(body.ma_below);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "요청 JSON 파싱 실패: " + message },
      { status: 400 }
    );
  }

  try {
    const cache =
      (await redisGetJSON<{
        generatedAt: string;
        count: number;
        items: CachedItem[];
      }>("screener:latest")) || null;

    if (!cache || !Array.isArray(cache.items)) {
      return NextResponse.json(
        {
          error:
            "사전 계산된 스크리닝 데이터가 없습니다. 크론 작업(/api/screener/cron)이 정상적으로 실행되었는지 확인해 주세요.",
        },
        { status: 503 }
      );
    }

    const filtered = cache.items.filter((d) => {
      const low52pct =
        d.low52w > 0 ? ((d.price - d.low52w) / d.low52w) * 100 : 0;
      const maBelow =
        d.ma20 != null &&
        d.ma60 != null &&
        d.ma120 != null &&
        d.price < d.ma20 &&
        d.price < d.ma60 &&
        d.price < d.ma120;

      if (d.psr > filters.psr_max) return false;
      if (d.ncr < filters.cash_min) return false;
      if (d.volume < filters.volume_min * 10000) return false;
      if (d.mktcap < filters.mktcap_min) return false;
      if (low52pct > filters.low52w_pct) return false;
      if (filters.ma_below && !maBelow) return false;
      return true;
    });

    const response = NextResponse.json(
      {
        list: filtered,
        filters,
        count: filtered.length,
      },
      { status: 200 }
    );
    response.headers.set("Cache-Control", "private, max-age=300");
    return response;
  } catch (e) {
    console.error("Screener run error raw:", e);
    try {
      console.error("상세 에러:", JSON.stringify(e, null, 2));
    } catch {
      console.error("상세 에러(JSON 직렬화 실패)");
    }
    console.error("에러 메시지:", e instanceof Error ? e.message : String(e));
    console.error("스택:", e instanceof Error ? e.stack : "없음");

    const message = e instanceof Error ? e.message : String(e);
    const isDartError = message.includes("DART") || message.includes("corpCode");
    const status = isDartError ? 400 : 500;
    return NextResponse.json(
      {
        error: "스크리닝 실행 중 오류: " + message,
      },
      { status }
    );
  }
}
