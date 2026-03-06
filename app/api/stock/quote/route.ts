export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

const NAVER_DAY_CHART = "https://fchart.stock.naver.com/sise.nhn";
const USER_AGENT = "Mozilla/5.0 (compatible; 600b-invest-screener/1.0)";

function ma(prices: number[], period: number): number | null {
  if (!prices.length || prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "symbol 필요 (예: 005930 또는 5930)" }, { status: 400 });
  }

  const code = String(symbol).replace(/\.KS$|\.KQ$/i, "").padStart(6, "0");
  const url = `${NAVER_DAY_CHART}?symbol=${encodeURIComponent(code)}&timeframe=day&count=130&requestType=0`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      next: { revalidate: 300 },
    });
    const xml = await res.text();

    const prices: number[] = [];
    const volumes: number[] = [];
    const itemRegex = /data="([^"]+)"/g;
    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(xml)) !== null) {
      const parts = match[1].split("|");
      if (parts.length < 6) continue;
      const close = parseInt(parts[4], 10);
      const vol = parseInt(parts[5], 10);
      if (!isNaN(close)) prices.push(close);
      if (!isNaN(vol)) volumes.push(vol);
    }

    if (prices.length === 0) {
      return NextResponse.json({ error: "일봉 데이터 없음" }, { status: 404 });
    }

    const currentPrice = prices[prices.length - 1];
    const low52w = Math.min(...prices);
    const ma20 = ma(prices, 20);
    const ma60 = ma(prices, 60);
    const ma120 = ma(prices, 120);
    const lastVolume = volumes.length ? volumes[volumes.length - 1] : 0;

    return NextResponse.json({
      price: currentPrice,
      low52w,
      ma20: ma20 ?? undefined,
      ma60: ma60 ?? undefined,
      ma120: ma120 ?? undefined,
      volume: lastVolume,
      marketCap: undefined,
    });
  } catch (e) {
    console.error("Naver quote error:", e);
    return NextResponse.json(
      { error: "주가 조회 오류" },
      { status: 500 }
    );
  }
}
