import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";

const DART_BASE = "https://opendart.fss.or.kr/api";

export type CompanyItem = {
  corp_code: string;
  corp_name: string;
  stock_code: string;
  corp_cls: string;
};

export async function fetchCompanyList(key: string): Promise<CompanyItem[]> {
  const url = `${DART_BASE}/corpCode.xml?crtfc_key=${encodeURIComponent(key)}`;
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  const arr = new Uint8Array(buffer);

  const isZip = arr.length >= 4 && arr[0] === 0x50 && arr[1] === 0x4b;
  if (!isZip) {
    const text = new TextDecoder().decode(arr);
    let data: { status?: string; message?: string } = {};
    try {
      data = JSON.parse(text) || {};
    } catch {
      throw new Error("DART 응답 형식이 올바르지 않습니다. 인증키를 확인해 주세요.");
    }
    throw new Error(data.message || "DART 회사 목록 조회 실패. 인증키를 확인해 주세요.");
  }

  const zip = new AdmZip(Buffer.from(arr));
  const entries = zip.getEntries();
  const xmlEntry = entries.find((e) => e.entryName.endsWith(".xml"));
  const entry = xmlEntry || entries[0];
  if (!entry) {
    throw new Error("DART 응답에 XML이 없습니다.");
  }
  const xmlText = entry.getData().toString("utf8");
  return parseCorpXml(xmlText);
}

function parseCorpXml(xmlText: string): CompanyItem[] {
  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(xmlText);
  const result = parsed?.result;
  if (!result) return [];

  let items = result.list;
  if (!items) return [];
  if (!Array.isArray(items)) items = [items];

  const list: CompanyItem[] = [];
  for (const item of items) {
    const stockCode = (item.stock_code ?? item.stockCode ?? "").toString().trim();
    if (!stockCode || stockCode === "-") continue;
    const corpCode = (item.corp_code ?? item.corpCode ?? "").toString().trim();
    const corpName = (item.corp_name ?? item.corpName ?? "").toString().trim();
    const corpCls = (item.corp_cls ?? item.corpCls ?? "").toString().trim();
    list.push({
      corp_code: corpCode,
      corp_name: corpName,
      stock_code: stockCode,
      corp_cls: corpCls === "Y" || corpCls === "K" ? corpCls : "Y",
    });
  }
  return list;
}
