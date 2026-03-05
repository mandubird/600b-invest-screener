export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart";

function ma(prices: number[], period: number): number | null {
  if (!prices.length || prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "symbol 필요 (예: 005930.KS)" }, { status: 400 });
  }

  try {
    const range = "1y";
    const interval = "1d";
    const url = `${YAHOO_CHART}/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Screener/1.0)" },
      next: { revalidate: 300 },
    });
    const data = await res.json();

    const chart = data?.chart?.result?.[0];
    if (!chart) {
      return NextResponse.json(
        { error: "차트 데이터 없음", meta: data?.chart?.error },
        { status: 404 }
      );
    }

    const meta = chart.meta || {};
    const quote = chart.indicators?.quote?.[0];
    const prices = (quote?.close || chart.indicators?.adjclose?.[0]?.adjclose || [])
      .filter((v: number | null) => v != null) as number[];

    const currentPrice = meta.regularMarketPrice ?? prices[prices.length - 1];
    if (currentPrice == null) {
      return NextResponse.json({ error: "현재가 없음" }, { status: 404 });
    }

    const low52w = prices.length ? Math.min(...prices) : currentPrice;
    const ma20 = ma(prices, 20);
    const ma60 = ma(prices, 60);
    const ma120 = ma(prices, 120);

    const timestamps = chart.timestamp || [];
    const volumes = (quote?.volume || []).filter((v: number | null) => v != null) as number[];
    const lastVolume = volumes.length ? volumes[volumes.length - 1] : 0;

    const marketCap = meta.marketCap ?? undefined;

    return NextResponse.json({
      price: currentPrice,
      low52w,
      ma20: ma20 ?? undefined,
      ma60: ma60 ?? undefined,
      ma120: ma120 ?? undefined,
      volume: lastVolume,
      marketCap,
    });
  } catch (e) {
    console.error("Yahoo quote error:", e);
    return NextResponse.json(
      { error: "주가 조회 오류" },
      { status: 500 }
    );
  }
}
