import { NextRequest, NextResponse } from "next/server";

const DART_BASE = "https://opendart.fss.or.kr/api";

function findAmount(list: { account_nm: string; thstrm_amount?: string }[], ...names: string[]) {
  for (const n of names) {
    const row = list.find((r) => (r.account_nm || "").includes(n));
    if (row && row.thstrm_amount) {
      const v = parseInt(row.thstrm_amount.replace(/,/g, ""), 10);
      if (!isNaN(v)) return v;
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  const key = process.env.DART_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "DART_API_KEY 미설정" }, { status: 500 });
  }

  const corpCode = request.nextUrl.searchParams.get("corp_code");
  if (!corpCode) {
    return NextResponse.json({ error: "corp_code 필요" }, { status: 400 });
  }

  const year = new Date().getFullYear();
  const reprtCode = "11011";

  try {
    const url = `${DART_BASE}/fnlttSinglAcnt.json?crtfc_key=${encodeURIComponent(key)}&corp_code=${encodeURIComponent(corpCode)}&bsns_year=${year}&reprt_code=${reprtCode}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    const data = await res.json();

    if (data.status !== "000" || !Array.isArray(data.list)) {
      const prevYear = year - 1;
      const url2 = `${DART_BASE}/fnlttSinglAcnt.json?crtfc_key=${encodeURIComponent(key)}&corp_code=${encodeURIComponent(corpCode)}&bsns_year=${prevYear}&reprt_code=${reprtCode}`;
      const res2 = await fetch(url2, { next: { revalidate: 3600 } });
      const data2 = await res2.json();
      if (data2.status !== "000" || !Array.isArray(data2.list)) {
        return NextResponse.json({
          current_assets: null,
          total_liabilities: null,
          revenue: null,
        });
      }
      const list = data2.list;
      const current_assets = findAmount(list, "유동자산");
      const total_liabilities = findAmount(list, "부채총계");
      const revenue = findAmount(list, "매출액", "매출");
      return NextResponse.json({
        current_assets,
        total_liabilities,
        revenue,
      });
    }

    const list = data.list;
    const current_assets = findAmount(list, "유동자산");
    const total_liabilities = findAmount(list, "부채총계");
    const revenue = findAmount(list, "매출액", "매출");

    return NextResponse.json({
      current_assets,
      total_liabilities,
      revenue,
    });
  } catch (e) {
    console.error("DART financials error:", e);
    return NextResponse.json(
      { error: "서버 오류" },
      { status: 500 }
    );
  }
}
