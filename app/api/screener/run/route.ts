export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { isManaged } from "@/lib/managedStocks";
import { fetchCompanyList } from "@/lib/dartCompanies";

const DART_BASE = "https://opendart.fss.or.kr/api";
const NAVER_MAIN = "https://finance.naver.com/item/main.naver";
const NAVER_DAILY_CHART = "https://fchart.stock.naver.com/sise.nhn";
const MAX_STOCKS = 10;
const BATCH = 6;

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

async function fetchNaverQuote(rawCode: string) {
  const code = rawCode.padStart(6, "0");
  const ua = "Mozilla/5.0 (compatible; 600b-invest-screener/1.0)";

  // 1) 메인 페이지에서 현재가, 시가총액
  const mainUrl = `${NAVER_MAIN}?code=${encodeURIComponent(code)}`;
  const mainRes = await fetch(mainUrl, {
    headers: { "User-Agent": ua },
  });
  const mainHtml = await mainRes.text();

  let price: number | null = null;
  let marketCap: number | undefined;

  try {
    const priceMatch = mainHtml.match(/현재가[^0-9]*([\d,]+)/);
    if (priceMatch) {
      price = parseInt(priceMatch[1].replace(/,/g, ""), 10);
    }
  } catch {
    // ignore
  }

  try {
    const mcapMatch = mainHtml.match(/시가총액[^0-9]*([\d,]+)\s*억/);
    if (mcapMatch) {
      const mcapEok = parseInt(mcapMatch[1].replace(/,/g, ""), 10);
      if (!isNaN(mcapEok)) {
        marketCap = mcapEok * 100_000_000;
      }
    }
  } catch {
    // ignore
  }

  // 2) 일봉 차트 데이터 (최대 130일)
  const chartUrl = `${NAVER_DAILY_CHART}?symbol=${encodeURIComponent(
    code
  )}&timeframe=day&count=130&requestType=0`;
  const chartRes = await fetch(chartUrl, {
    headers: { "User-Agent": ua },
  });
  const chartXml = await chartRes.text();

  const prices: number[] = [];
  const volumes: number[] = [];

  const itemRegex = /data=\"([^\"]+)\"/g;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(chartXml)) !== null) {
    const parts = match[1].split("|");
    if (parts.length < 6) continue;
    const close = parseInt(parts[4], 10);
    const vol = parseInt(parts[5], 10);
    if (!isNaN(close)) prices.push(close);
    if (!isNaN(vol)) volumes.push(vol);
  }

  if (prices.length === 0) {
    if (price == null) return null;
    return {
      price,
      low52w: price,
      ma20: null,
      ma60: null,
      ma120: null,
      volume: 0,
      marketCap,
    };
  }

  const lastPrice = price ?? prices[prices.length - 1];
  const low52w = Math.min(...prices);
  const ma20 = ma(prices, 20);
  const ma60 = ma(prices, 60);
  const ma120 = ma(prices, 120);
  const lastVolume = volumes.length ? volumes[volumes.length - 1] : 0;

  return {
    price: lastPrice,
    low52w,
    ma20,
    ma60,
    ma120,
    volume: lastVolume,
    marketCap,
  };
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
    const fullList = await fetchCompanyList(key);
    const companies = fullList
      .filter((c) => {
        const code = (c.stock_code || "").trim();
        const cls = (c.corp_cls || "").trim();
        return code && code !== "-" && (cls === "Y" || cls === "K") && !isManaged(code);
      })
      .slice(0, MAX_STOCKS);

    const results: {
      ticker: string;
      name: string;
      price: number;
      mktcap: number | null;
      volume: number;
      low52w: number;
      psr: number;
      ncr: number;
      ma20: number;
      ma60: number;
      ma120: number;
    }[] = [];

    for (let i = 0; i < companies.length; i += BATCH) {
      const batch = companies.slice(i, i + BATCH);
      const settled = await Promise.allSettled(
        batch.map(async (c) => {
          const [fin, quote] = await Promise.all([
            fetchDartFinancials(key, c.corp_code),
            fetchNaverQuote(c.stock_code),
          ]);
          if (!quote || quote.price == null) return null;
          const revenue = fin.revenue;
          const currentAssets = fin.current_assets;
          const totalLiab = fin.total_liabilities;
          const mktcap = quote.marketCap
            ? Math.round(quote.marketCap / 100_000_000)
            : null;
          if (revenue == null || revenue <= 0) return null;
          const psr =
            mktcap != null && mktcap > 0
              ? (mktcap * 100_000_000) / revenue
              : Infinity;
          const netCash =
            currentAssets != null && totalLiab != null ? currentAssets - totalLiab : null;
          const ncr =
            quote.marketCap && netCash != null && quote.marketCap > 0
              ? netCash / quote.marketCap
              : -1;

          const low52pct =
            quote.low52w > 0 ? ((quote.price - quote.low52w) / quote.low52w) * 100 : 0;
          const maBelow =
            (quote.ma20 != null && quote.price < quote.ma20) &&
            (quote.ma60 != null && quote.price < quote.ma60) &&
            (quote.ma120 != null && quote.price < quote.ma120);

          const volMin = filters.volume_min * 10000;
          if (psr > filters.psr_max) return null;
          if (ncr < filters.cash_min) return null;
          if (quote.volume < volMin) return null;
          if (mktcap != null && mktcap < filters.mktcap_min) return null;
          if (low52pct > filters.low52w_pct) return null;
          if (filters.ma_below && !maBelow) return null;

          return {
            ticker: c.stock_code,
            name: c.corp_name,
            price: quote.price,
            mktcap: mktcap ?? null,
            volume: quote.volume,
            low52w: quote.low52w,
            psr,
            ncr,
            ma20: quote.ma20 ?? 0,
            ma60: quote.ma60 ?? 0,
            ma120: quote.ma120 ?? 0,
          };
        })
      );

      for (const p of settled) {
        if (p.status === "fulfilled" && p.value) results.push(p.value);
      }
    }

    const response = NextResponse.json(
      {
        list: results,
        filters,
        count: results.length,
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
