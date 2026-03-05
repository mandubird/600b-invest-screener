export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { isManaged } from "@/lib/managedStocks";
import { fetchCompanyList } from "@/lib/dartCompanies";

const DART_BASE = "https://opendart.fss.or.kr/api";
const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart";
const MAX_STOCKS = 120;
const BATCH = 6;

type ScreenerItem = {
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

function findAmount(list: { account_nm?: string; thstrm_amount?: string }[], ...names: string[]) {
  for (const n of names) {
    const row = list.find((r) => (r.account_nm || "").includes(n));
    if (row && row.thstrm_amount) {
      const v = parseInt(String(row.thstrm_amount).replace(/,/g, ""), 10);
      if (!isNaN(v)) return v;
    }
  }
  return null;
}

function ma(prices: number[], period: number): number | null {
  if (!prices.length || prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

async function fetchDartFinancials(key: string, corpCode: string) {
  const year = new Date().getFullYear();
  const url = `${DART_BASE}/fnlttSinglAcnt.json?crtfc_key=${encodeURIComponent(
    key
  )}&corp_code=${encodeURIComponent(corpCode)}&bsns_year=${year}&reprt_code=11011`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== "000" || !Array.isArray(data.list)) {
    const url2 = `${DART_BASE}/fnlttSinglAcnt.json?crtfc_key=${encodeURIComponent(
      key
    )}&corp_code=${encodeURIComponent(corpCode)}&bsns_year=${year - 1}&reprt_code=11011`;
    const res2 = await fetch(url2);
    const data2 = await res2.json();
    if (data2.status !== "000" || !Array.isArray(data2.list))
      return { current_assets: null, total_liabilities: null, revenue: null };
    const list = data2.list;
    return {
      current_assets: findAmount(list, "유동자산"),
      total_liabilities: findAmount(list, "부채총계"),
      revenue: findAmount(list, "매출액", "매출"),
    };
  }
  const list = data.list;
  return {
    current_assets: findAmount(list, "유동자산"),
    total_liabilities: findAmount(list, "부채총계"),
    revenue: findAmount(list, "매출액", "매출"),
  };
}

async function fetchYahooQuote(symbol: string) {
  const url = `${YAHOO_CHART}/${encodeURIComponent(symbol)}?range=1y&interval=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Screener/1.0)" },
  });
  const data = await res.json();
  const chart = data?.chart?.result?.[0];
  if (!chart) return null;
  const meta = chart.meta || {};
  const quote = chart.indicators?.quote?.[0];
  const prices = (quote?.close || chart.indicators?.adjclose?.[0]?.adjclose || [])
    .filter((v: number | null) => v != null) as number[];
  const currentPrice = meta.regularMarketPrice ?? prices[prices.length - 1];
  if (currentPrice == null) return null;
  const volumes = (quote?.volume || []).filter((v: number | null) => v != null) as number[];
  const lastVolume = volumes.length ? volumes[volumes.length - 1] : 0;
  return {
    price: currentPrice,
    low52w: prices.length ? Math.min(...prices) : currentPrice,
    ma20: ma(prices, 20),
    ma60: ma(prices, 60),
    ma120: ma(prices, 120),
    volume: lastVolume,
    marketCap: meta.marketCap as number | undefined,
  };
}

export async function GET() {
  const key = process.env.DART_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "DART_API_KEY가 설정되지 않았습니다. Vercel 환경변수를 설정하세요." },
      { status: 500 }
    );
  }

  const startedAt = new Date();

  try {
    const fullList = await fetchCompanyList(key);
    const companies = fullList
      .filter((c) => {
        const code = (c.stock_code || "").trim();
        const cls = (c.corp_cls || "").trim();
        return code && code !== "-" && (cls === "Y" || cls === "K") && !isManaged(code);
      })
      .slice(0, MAX_STOCKS);

    const items: ScreenerItem[] = [];

    for (let i = 0; i < companies.length; i += BATCH) {
      const batch = companies.slice(i, i + BATCH);
      const settled = await Promise.allSettled(
        batch.map(async (c) => {
          const [fin, quote] = await Promise.all([
            fetchDartFinancials(key, c.corp_code),
            fetchYahooQuote(c.stock_code + (c.corp_cls === "Y" ? ".KS" : ".KQ")),
          ]);
          if (!quote || quote.price == null) return null;

          const revenue = fin.revenue;
          const currentAssets = fin.current_assets;
          const totalLiab = fin.total_liabilities;
          const marketCapRaw = quote.marketCap;

          if (!revenue || revenue <= 0 || !marketCapRaw || marketCapRaw <= 0) return null;

          const mktcap = Math.round(marketCapRaw / 100_000_000);
          const psr = (mktcap * 100_000_000) / revenue;
          const netCash =
            currentAssets != null && totalLiab != null ? currentAssets - totalLiab : null;
          const ncr =
            netCash != null && marketCapRaw > 0 ? netCash / marketCapRaw : -1;

          return {
            ticker: c.stock_code,
            name: c.corp_name,
            price: quote.price,
            mktcap,
            volume: quote.volume,
            low52w: quote.low52w,
            psr,
            ncr,
            ma20: quote.ma20 ?? null,
            ma60: quote.ma60 ?? null,
            ma120: quote.ma120 ?? null,
          } as ScreenerItem;
        })
      );

      for (const p of settled) {
        if (p.status === "fulfilled" && p.value) items.push(p.value);
      }
    }

    const payload = {
      generatedAt: new Date().toISOString(),
      count: items.length,
      items,
    };

    await kv.set("screener:latest", payload);

    const durationMs = Date.now() - startedAt.getTime();

    return NextResponse.json({
      ok: true,
      ...payload,
      durationMs,
    });
  } catch (e) {
    console.error("Screener cron error:", e);
    try {
      console.error("상세 에러(크론):", JSON.stringify(e, null, 2));
    } catch {
      console.error("상세 에러(크론 JSON 직렬화 실패)");
    }
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "크론 스캐닝 중 오류: " + message },
      { status: 500 }
    );
  }
}

