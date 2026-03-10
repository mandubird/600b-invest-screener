export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { isManaged } from "@/lib/managedStocks";
import { fetchCompanyList, type CompanyItem } from "@/lib/dartCompanies";

const DART_BASE = "https://opendart.fss.or.kr/api";
const NAVER_MAIN = "https://finance.naver.com/item/main.naver";
const NAVER_DAILY_CHART = "https://fchart.stock.naver.com/sise.nhn";
const DEFAULT_MAX_STOCKS = 40;
const MAX_STOCKS_HARD_LIMIT = 120;
const BATCH = 6;
const COMPANY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let companyListCache: {
  key: string;
  list: CompanyItem[];
  fetchedAt: number;
} | null = null;

type ScreenerFilters = {
  psr_max: number;
  cash_min: number;
  volume_min: number;
  mktcap_min: number;
  low52w_pct: number;
  ma_below: boolean;
};

type Candidate = {
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
  low52pct: number;
  maBelow: boolean;
};

type FilterRejectStats = {
  psr: number;
  ncr: number;
  volume: number;
  mktcap: number;
  low52w: number;
  maBelow: number;
};

type FilterResult = {
  passed: Candidate[];
  rejectStats: FilterRejectStats;
};

type CollectionStats = {
  totalProcessed: number;
  noQuote: number;
  noRevenue: number;
  noMarketCap: number;
  noNetCash: number;
  collected: number;
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

function parseKoreanMktCapToWon(html: string): number | undefined {
  const inner = html.match(/id=["']_market_sum["'][^>]*>([\s\S]*?)<\/em>/i)?.[1];
  if (!inner) return undefined;

  const text = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return undefined;

  const joMatch = text.match(/([\d,]+)\s*조/);
  const eokMatch = text.match(/조\s*([\d,]+)/) || text.match(/([\d,]+)\s*억/);

  const jo = joMatch ? parseInt(joMatch[1].replace(/,/g, ""), 10) : 0;
  const eok = eokMatch ? parseInt(eokMatch[1].replace(/,/g, ""), 10) : 0;

  if (Number.isNaN(jo) || Number.isNaN(eok)) return undefined;
  if (jo === 0 && eok === 0) return undefined;
  return (jo * 10_000 + eok) * 100_000_000;
}

function parseListedShares(html: string): number | undefined {
  const sharesMatch = html.match(/상장주식수[\s\S]{0,120}?<em>([\d,]+)<\/em>/);
  if (!sharesMatch) return undefined;
  const shares = parseInt(sharesMatch[1].replace(/,/g, ""), 10);
  return Number.isNaN(shares) ? undefined : shares;
}

function selectEvenly<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = arr.length / max;
  const picked: T[] = [];
  for (let i = 0; i < max; i++) {
    picked.push(arr[Math.floor(i * step)]);
  }
  return picked;
}

function emptyRejectStats(): FilterRejectStats {
  return {
    psr: 0,
    ncr: 0,
    volume: 0,
    mktcap: 0,
    low52w: 0,
    maBelow: 0,
  };
}

function applyScreenerFilters(items: Candidate[], filters: ScreenerFilters): FilterResult {
  const volMin = filters.volume_min * 10_000;
  const rejectStats = emptyRejectStats();
  const passed: Candidate[] = [];

  for (const item of items) {
    if (item.psr > filters.psr_max) {
      rejectStats.psr += 1;
      continue;
    }
    if (item.ncr < filters.cash_min) {
      rejectStats.ncr += 1;
      continue;
    }
    if (item.volume < volMin) {
      rejectStats.volume += 1;
      continue;
    }
    if (item.mktcap != null && item.mktcap < filters.mktcap_min) {
      rejectStats.mktcap += 1;
      continue;
    }
    if (item.low52pct > filters.low52w_pct) {
      rejectStats.low52w += 1;
      continue;
    }
    if (filters.ma_below && !item.maBelow) {
      rejectStats.maBelow += 1;
      continue;
    }
    passed.push(item);
  }

  return { passed, rejectStats };
}

function buildRelaxedFilters(filters: ScreenerFilters): ScreenerFilters {
  return {
    psr_max: Math.min(1.5, filters.psr_max + 0.4),
    cash_min: Math.max(-0.2, filters.cash_min - 0.3),
    volume_min: Math.max(10, Math.floor(filters.volume_min * 0.3)),
    mktcap_min: Math.max(10, Math.floor(filters.mktcap_min * 0.5)),
    low52w_pct: Math.min(70, filters.low52w_pct + 25),
    ma_below: false,
  };
}

function resolveMaxStocks() {
  const raw = Number(process.env.SCREENER_MAX_STOCKS ?? DEFAULT_MAX_STOCKS);
  if (!Number.isFinite(raw)) return DEFAULT_MAX_STOCKS;
  const value = Math.floor(raw);
  return Math.min(MAX_STOCKS_HARD_LIMIT, Math.max(10, value));
}

async function getCachedCompanyList(key: string) {
  const now = Date.now();
  if (
    companyListCache &&
    companyListCache.key === key &&
    now - companyListCache.fetchedAt < COMPANY_CACHE_TTL_MS
  ) {
    return companyListCache.list;
  }

  const list = await fetchCompanyList(key);
  companyListCache = { key, list, fetchedAt: now };
  return list;
}

async function fetchDartFinancials(key: string, corpCode: string) {
  const thisYear = new Date().getFullYear();
  const reportCodes = ["11011", "11014", "11012", "11013"];

  for (let year = thisYear; year >= thisYear - 2; year--) {
    for (const reprtCode of reportCodes) {
      const url = `${DART_BASE}/fnlttSinglAcnt.json?crtfc_key=${encodeURIComponent(
        key
      )}&corp_code=${encodeURIComponent(corpCode)}&bsns_year=${year}&reprt_code=${reprtCode}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status !== "000" || !Array.isArray(data.list)) continue;

      const list = data.list;
      return {
        current_assets: findAmount(list, "유동자산"),
        total_liabilities: findAmount(list, "부채총계"),
        revenue: findAmount(
          list,
          "매출액",
          "매출",
          "영업수익",
          "순영업수익",
          "이자수익",
          "보험료수익"
        ),
      };
    }
  }

  return { current_assets: null, total_liabilities: null, revenue: null };
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

  marketCap = parseKoreanMktCapToWon(mainHtml);

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
  if (!marketCap) {
    const shares = parseListedShares(mainHtml);
    if (shares && lastPrice > 0) {
      marketCap = shares * lastPrice;
    }
  }
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

  let filters: ScreenerFilters = {
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
    const maxStocks = resolveMaxStocks();
    const fullList = await getCachedCompanyList(key);
    const companies = fullList
      .filter((c) => {
        const code = (c.stock_code || "").trim();
        const cls = (c.corp_cls || "").trim();
        return code && code !== "-" && (cls === "Y" || cls === "K") && !isManaged(code);
      });
    const selectedCompanies = selectEvenly(companies, maxStocks);
    const candidates: Candidate[] = [];
    const collectionStats: CollectionStats = {
      totalProcessed: 0,
      noQuote: 0,
      noRevenue: 0,
      noMarketCap: 0,
      noNetCash: 0,
      collected: 0,
    };

    for (let i = 0; i < selectedCompanies.length; i += BATCH) {
      const batch = selectedCompanies.slice(i, i + BATCH);
      const settled = await Promise.allSettled(
        batch.map(async (c) => {
          collectionStats.totalProcessed += 1;
          const [fin, quote] = await Promise.all([
            fetchDartFinancials(key, c.corp_code),
            fetchNaverQuote(c.stock_code),
          ]);
          if (!quote || quote.price == null) {
            collectionStats.noQuote += 1;
            return null;
          }
          const revenue = fin.revenue;
          const currentAssets = fin.current_assets;
          const totalLiab = fin.total_liabilities;
          const mktcap = quote.marketCap
            ? Math.round(quote.marketCap / 100_000_000)
            : null;
          if (revenue == null || revenue <= 0) {
            collectionStats.noRevenue += 1;
            return null;
          }
          if (mktcap == null || mktcap <= 0) {
            collectionStats.noMarketCap += 1;
            return null;
          }
          const psr =
            (mktcap * 100_000_000) / revenue;
          const netCash =
            currentAssets != null && totalLiab != null ? currentAssets - totalLiab : null;
          if (netCash == null || !quote.marketCap || quote.marketCap <= 0) {
            collectionStats.noNetCash += 1;
          }
          const ncr = quote.marketCap && netCash != null && quote.marketCap > 0
            ? netCash / quote.marketCap
            : -1;

          const low52pct =
            quote.low52w > 0 ? ((quote.price - quote.low52w) / quote.low52w) * 100 : 0;
          const maBelow =
            (quote.ma20 != null && quote.price < quote.ma20) &&
            (quote.ma60 != null && quote.price < quote.ma60) &&
            (quote.ma120 != null && quote.price < quote.ma120);

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
            low52pct,
            maBelow,
          };
        })
      );

      for (const p of settled) {
        if (p.status === "fulfilled" && p.value) {
          candidates.push(p.value);
          collectionStats.collected += 1;
        }
      }
    }

    const strictResult = applyScreenerFilters(candidates, filters);
    let results = strictResult.passed;
    let appliedFilters = filters;
    let usedRelaxedFallback = false;
    let relaxedRejectStats = emptyRejectStats();

    if (strictResult.passed.length === 0 && candidates.length > 0) {
      const relaxed = buildRelaxedFilters(filters);
      const relaxedResult = applyScreenerFilters(candidates, relaxed);
      relaxedRejectStats = relaxedResult.rejectStats;
      if (relaxedResult.passed.length > 0) {
        results = relaxedResult.passed;
        appliedFilters = relaxed;
        usedRelaxedFallback = true;
      }
    }

    const response = NextResponse.json(
      {
        list: results,
        filters: appliedFilters,
        requestedFilters: filters,
        usedRelaxedFallback,
        diagnostics: {
          collection: collectionStats,
          strictFilterRejects: strictResult.rejectStats,
          relaxedFilterRejects: relaxedRejectStats,
        },
        scanned: selectedCompanies.length,
        maxStocks,
        candidates: candidates.length,
        count: results.length,
        generatedAt: new Date().toISOString(),
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
