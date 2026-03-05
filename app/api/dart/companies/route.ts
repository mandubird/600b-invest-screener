export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { fetchCompanyList } from "@/lib/dartCompanies";

export async function GET() {
  const key = process.env.DART_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "DART_API_KEY가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  try {
    const list = await fetchCompanyList(key);
    return NextResponse.json({ list });
  } catch (e) {
    const message = e instanceof Error ? e.message : "회사 목록 조회 중 오류가 발생했습니다.";
    return NextResponse.json(
      { error: message + " DART 인증키와 네트워크를 확인해 주세요." },
      { status: 400 }
    );
  }
}
