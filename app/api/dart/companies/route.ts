import { NextResponse } from "next/server";

const DART_BASE = "https://opendart.fss.or.kr/api";

export async function GET() {
  const key = process.env.DART_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "DART_API_KEY가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  try {
    const list: { corp_code: string; corp_name: string; stock_code: string; corp_cls: string }[] = [];
    let pageNo = 1;
    const pageCount = 100;

    while (true) {
      const url = `${DART_BASE}/company/list.json?crtfc_key=${encodeURIComponent(key)}&page_no=${pageNo}&page_count=${pageCount}`;
      const res = await fetch(url, { next: { revalidate: 86400 } }); // 1일 캐시
      const data = await res.json();

      if (data.status !== "000" || !data.list) {
        if (pageNo === 1) {
          return NextResponse.json(
            { error: data.message || "DART 회사 목록 조회 실패" },
            { status: 400 }
          );
        }
        break;
      }

      for (const item of data.list) {
        const stockCode = (item.stock_code || "").trim();
        const corpCls = (item.corp_cls || "").trim();
        if (!stockCode || stockCode === "-") continue;
        if (corpCls !== "Y" && corpCls !== "K") continue;
        list.push({
          corp_code: item.corp_code,
          corp_name: item.corp_name,
          stock_code: stockCode,
          corp_cls: corpCls,
        });
      }

      if (!data.list.length || data.list.length < pageCount) break;
      pageNo++;
      if (pageNo > 50) break;
    }

    return NextResponse.json({ list });
  } catch (e) {
    console.error("DART companies error:", e);
    return NextResponse.json(
      { error: "서버 오류" },
      { status: 500 }
    );
  }
}
