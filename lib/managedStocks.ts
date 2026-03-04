/**
 * 관리종목/지정종목 목록 (제외 대상)
 * KRX에서 공시하는 관리종목을 수동으로 갱신하거나, 추후 API로 연동 가능
 * @see https://data.krx.co.kr
 */
export const MANAGED_STOCK_CODES = new Set<string>([
  // 예시: 필요 시 종목코드 추가
  // "012345",
]);

export function isManaged(stockCode: string): boolean {
  return MANAGED_STOCK_CODES.has((stockCode || "").trim());
}
