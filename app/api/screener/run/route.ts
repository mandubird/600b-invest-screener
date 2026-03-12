export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { isManaged } from "@/lib/managedStocks";
import { fetchCompanyList, type CompanyItem } from "@/lib/dartCompanies";

const DART_BASE = "https://opendart.fss.or.kr/api";
const NAVER_MAIN = "https://finance.naver.com/item/main.naver";
const NAVER_DAILY_CHART = "https://fchart.stock.naver.com/sise.nhn";
const DEFAULT_MAX_STOCKS = 20;
const MAX_STOCKS_HARD_LIMIT = 120;
const BATCH = 6;
const COMPANY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FINANCIAL_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const EXTERNAL_TIMEOUT_MS = 8_000;
const API_TIME_BUDGET_MS_DEFAULT = 52_000;
const API_TIME_BUDGET_MS_MAX = 58_000;

let companyListCache: {
  key: string;
  list: CompanyItem[];
  fetchedAt: number;
} | null = null;

let financialCache: Map<
  string,
  {
    fetchedAt: number;
    value: { current_assets: number | null; total_liabilities: number | null; revenue: number | null };
  }
> = new Map();

async function fetchTextWithTimeout(url: string, init?: RequestInit, timeoutMs = EXTERNAL_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonWithTimeout<T = any>(url: string, init?: RequestInit, timeoutMs = EXTERNAL_TIMEOUT_MS): Promise<T | null> {
  const text = await fetchTextWithTimeout(url, init, timeoutMs);
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

type ScreenerFilters = {
  psr_max: number;
  cash_min: number;
  volume_min: number;
  mktcap_min: number;
  low52w_pct: number;
  ma_below: boolean;
  use_volume_filter: boolean;
  use_mktcap_filter: boolean;
  use_low52w_filter: boolean;
  use_ma_filter: boolean;
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
  timeBudgetHit: boolean;
};

type DartFinancialRow = {
  account_id?: string;
  account_nm?: string;
  thstrm_amount?: string;
  frmtrm_amount?: string;
  bfefrmtrm_amount?: string;
};

function parseAmount(value?: string): number | null {
  if (!value) return null;
  const normalized = String(value).trim().replace(/,/g, "");
  if (!normalized || normalized === "-") return null;
  const negative = /^\(.*\)$/.test(normalized);
  const numeric = normalized.replace(/[()]/g, "");
  const n = Number(numeric);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

function readAmountFromRow(row?: DartFinancialRow): number | null {
  if (!row) return null;
  return (
    parseAmount(row.thstrm_amount) ??
    parseAmount(row.frmtrm_amount) ??
    parseAmount(row.bfefrmtrm_amount)
  );
}

function normalizeAccountName(name: string) {
  return name
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()[\]{}.,]/g, "");
}

function normalizeAccountId(id: string) {
  return id.toLowerCase().replace(/\s+/g, "");
}

function findAmountByAccountIds(list: DartFinancialRow[], accountIds: string[]) {
  const normalizedIds = accountIds.map((id) => normalizeAccountId(id));
  for (const row of list) {
    const rowId = normalizeAccountId(row.account_id || "");
    if (!rowId) continue;
    if (!normalizedIds.some((id) => rowId.includes(id))) continue;
    const amount = readAmountFromRow(row);
    if (amount != null) return amount;
  }
  return null;
}

function findAmountByAliases(list: DartFinancialRow[], aliases: string[]) {
  const normalizedAliases = aliases.map((a) => normalizeAccountName(a));
  for (const row of list) {
    const account = normalizeAccountName(row.account_nm || "");
    if (!account) continue;
    const matched = normalizedAliases.some((alias) => account.includes(alias));
    if (!matched) continue;
    const amount = readAmountFromRow(row);
    if (amount != null) return amount;
  }
  return null;
}

function findRevenueAmount(list: DartFinancialRow[]) {
  const revenueById = findAmountByAccountIds(list, [
    "ifrs-full_revenue",
    "ifrs_revenue",
    "dart_revenue",
    "ifrs-full_insurancerevenue",
  ]);
  if (revenueById != null && revenueById > 0) return revenueById;

  const excluded = [
    "매출원가",
    "영업비용",
    "판매비",
    "관리비",
    "금융비용",
    "비용",
    "원가",
    "손실",
    "매출채권",
  ].map((x) => normalizeAccountName(x));
  const aliases = [
    "매출액",
    "영업수익",
    "순영업수익",
    "보험영업수익",
    "보험료수익",
    "이자수익",
    "수수료수익",
    "용역수익",
    "공사수익",
    "분양수익",
    "상품매출",
    "제품매출",
    "Revenue",
  ].map((x) => normalizeAccountName(x));

  for (const row of list) {
    const account = normalizeAccountName(row.account_nm || "");
    if (!account) continue;
    if (excluded.some((token) => account.includes(token))) continue;
    if (!aliases.some((alias) => account.includes(alias))) continue;
    const amount = readAmountFromRow(row);
    if (amount != null && amount > 0) return amount;
  }

  return findAmountByAliases(list, ["매출액", "영업수익", "순영업수익"]);
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

function buildDiagnosticsHint(
  collection: CollectionStats,
  strictRejects: FilterRejectStats
) {
  if (collection.collected === 0) {
    if (collection.noQuote >= collection.totalProcessed * 0.7) {
      return "시세 수집 실패 비중이 높습니다. 잠시 후 다시 시도하거나 /local 업로드 방식을 사용해 주세요.";
    }
    if (collection.noRevenue >= collection.totalProcessed * 0.7) {
      return collection.timeBudgetHit
        ? "매출 데이터 인식 비중이 낮고 시간 제한도 일부 영향이 있습니다. 잠시 후 재시도하거나 /local 업로드 사용을 권장합니다."
        : "재무(매출) 데이터 인식 비중이 낮습니다. 공시 시점/업종 계정명 차이 영향을 받고 있습니다.";
    }
    if (collection.noMarketCap >= collection.totalProcessed * 0.5) {
      return "시가총액 파싱 실패 비중이 높습니다. 데이터 소스 응답 형식을 점검해야 합니다.";
    }
    if (collection.timeBudgetHit) {
      return "서버 시간 제한에 가까워 일부 종목만 처리했습니다. 잠시 후 다시 시도하거나 /local 업로드 방식 사용을 권장합니다.";
    }
    return "데이터 수집 후보가 부족합니다. 다시 실행하거나 로컬 업로드 데이터를 사용해 주세요.";
  }

  if (collection.timeBudgetHit) {
    return "서버 시간 제한에 가까워 일부 종목만 처리했습니다. 잠시 후 다시 시도하거나 /local 업로드 방식 사용을 권장합니다.";
  }

  const pairs: Array<[keyof FilterRejectStats, number, string]> = [
    ["psr", strictRejects.psr, "PSR 조건에서 많이 탈락했습니다."],
    ["ncr", strictRejects.ncr, "순현금비율 조건에서 많이 탈락했습니다."],
    ["volume", strictRejects.volume, "거래량 하한 조건에서 많이 탈락했습니다."],
    ["mktcap", strictRejects.mktcap, "시가총액 하한 조건에서 많이 탈락했습니다."],
    ["low52w", strictRejects.low52w, "52주 저점 대비 조건에서 많이 탈락했습니다."],
    ["maBelow", strictRejects.maBelow, "이평선 하단 조건에서 많이 탈락했습니다."],
  ];
  const top = pairs.sort((a, b) => b[1] - a[1])[0];
  return top && top[1] > 0 ? top[2] : "현재 조건에서 통과 종목이 없습니다.";
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
    if (filters.use_volume_filter && item.volume < volMin) {
      rejectStats.volume += 1;
      continue;
    }
    if (filters.use_mktcap_filter && item.mktcap != null && item.mktcap < filters.mktcap_min) {
      rejectStats.mktcap += 1;
      continue;
    }
    if (filters.use_low52w_filter && item.low52pct > filters.low52w_pct) {
      rejectStats.low52w += 1;
      continue;
    }
    if (filters.use_ma_filter && filters.ma_below && !item.maBelow) {
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
    use_volume_filter: filters.use_volume_filter,
    use_mktcap_filter: filters.use_mktcap_filter,
    use_low52w_filter: filters.use_low52w_filter,
    use_ma_filter: false,
  };
}

function resolveMaxStocks() {
  const raw = Number(process.env.SCREENER_MAX_STOCKS ?? DEFAULT_MAX_STOCKS);
  if (!Number.isFinite(raw)) return DEFAULT_MAX_STOCKS;
  const value = Math.floor(raw);
  return Math.min(MAX_STOCKS_HARD_LIMIT, Math.max(10, value));
}

function resolveTimeBudgetMs() {
  const raw = Number(process.env.SCREENER_TIME_BUDGET_MS ?? API_TIME_BUDGET_MS_DEFAULT);
  if (!Number.isFinite(raw)) return API_TIME_BUDGET_MS_DEFAULT;
  const value = Math.floor(raw);
  return Math.min(API_TIME_BUDGET_MS_MAX, Math.max(20_000, value));
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
  const cacheKey = `${key}:${corpCode}`;
  const cached = financialCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < FINANCIAL_CACHE_TTL_MS) {
    return cached.value;
  }

  const thisYear = new Date().getFullYear();
  const years = [thisYear - 1, thisYear - 2, thisYear];
  const reportCodes = ["11011", "11012", "11013", "11014"];
  const fsDivList = ["CFS", "OFS"];
  let best: { current_assets: number | null; total_liabilities: number | null; revenue: number | null } = {
    current_assets: null,
    total_liabilities: null,
    revenue: null,
  };

  for (const year of years) {
    for (const reprtCode of reportCodes) {
      for (const fsDiv of fsDivList) {
        const url = `${DART_BASE}/fnlttSinglAcnt.json?crtfc_key=${encodeURIComponent(
          key
        )}&corp_code=${encodeURIComponent(corpCode)}&bsns_year=${year}&reprt_code=${reprtCode}&fs_div=${fsDiv}`;
        const data = await fetchJsonWithTimeout<{ status?: string; list?: DartFinancialRow[] }>(url);
        if (!data) continue;
        if (data.status !== "000" || !Array.isArray(data.list)) continue;

        const list = data.list;
        const revenue = findRevenueAmount(list);
        const currentAssets =
          findAmountByAccountIds(list, ["ifrs-full_currentassets", "ifrs_currentassets", "dart_currentassets"]) ??
          findAmountByAliases(list, ["유동자산"]);
        const totalLiabilities =
          findAmountByAccountIds(list, ["ifrs-full_liabilities", "ifrs_liabilities", "dart_liabilities"]) ??
          findAmountByAliases(list, ["부채총계", "부채총계(유동/비유동 포함)"]);

        if (currentAssets != null) best.current_assets = currentAssets;
        if (totalLiabilities != null) best.total_liabilities = totalLiabilities;
        if (revenue != null && revenue > 0) {
          const value = {
            current_assets: currentAssets ?? best.current_assets,
            total_liabilities: totalLiabilities ?? best.total_liabilities,
            revenue,
          };
          financialCache.set(cacheKey, { fetchedAt: Date.now(), value });
          return value;
        }
      }
    }
  }

  financialCache.set(cacheKey, { fetchedAt: Date.now(), value: best });
  return best;
}

async function fetchNaverQuote(rawCode: string) {
  const code = rawCode.padStart(6, "0");
  const ua = "Mozilla/5.0 (compatible; 600b-invest-screener/1.0)";

  // 1) 메인 페이지에서 현재가, 시가총액
  const mainUrl = `${NAVER_MAIN}?code=${encodeURIComponent(code)}`;
  const mainHtml = await fetchTextWithTimeout(mainUrl, {
    headers: { "User-Agent": ua },
  });
  if (!mainHtml) return null;

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
  const chartXml = await fetchTextWithTimeout(chartUrl, {
    headers: { "User-Agent": ua },
  });
  if (!chartXml) {
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
    use_volume_filter: true,
    use_mktcap_filter: true,
    use_low52w_filter: true,
    use_ma_filter: true,
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
    if (body.use_volume_filter != null) filters.use_volume_filter = Boolean(body.use_volume_filter);
    if (body.use_mktcap_filter != null) filters.use_mktcap_filter = Boolean(body.use_mktcap_filter);
    if (body.use_low52w_filter != null) filters.use_low52w_filter = Boolean(body.use_low52w_filter);
    if (body.use_ma_filter != null) filters.use_ma_filter = Boolean(body.use_ma_filter);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "요청 JSON 파싱 실패: " + message },
      { status: 400 }
    );
  }

  try {
    const maxStocks = resolveMaxStocks();
    const timeBudgetMs = resolveTimeBudgetMs();
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
      timeBudgetHit: false,
    };
    const startAt = Date.now();

    for (let i = 0; i < selectedCompanies.length; i += BATCH) {
      if (Date.now() - startAt > timeBudgetMs) {
        collectionStats.timeBudgetHit = true;
        break;
      }
      const batch = selectedCompanies.slice(i, i + BATCH);
      const settled = await Promise.allSettled(
        batch.map(async (c) => {
          collectionStats.totalProcessed += 1;
          const quote = await fetchNaverQuote(c.stock_code);
          if (!quote || quote.price == null) {
            collectionStats.noQuote += 1;
            return null;
          }
          const fin = await fetchDartFinancials(key, c.corp_code);
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
          hint: buildDiagnosticsHint(collectionStats, strictResult.rejectStats),
        },
        partial: collectionStats.timeBudgetHit,
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
