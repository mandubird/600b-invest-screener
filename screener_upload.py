"""
로컬에서 실행하는 업로드 스크립트.

기능:
- pykrx로 KOSPI/KOSDAQ 종목의 주가·거래량·이평선 계산
- DART Open API로 유동자산, 부채총계, 매출액 조회
- PSR, 순현금비율 계산 및 필터링
- 결과를 JSON으로 만들어 Vercel API(/api/results/upload)에 업로드

필수 환경변수:
- DART_API_KEY: DART 오픈API 키
- UPLOAD_SECRET: /api/results/upload 에서 검증할 비밀 문자열

실행 예시:
  export DART_API_KEY=발급키
  export UPLOAD_SECRET=mysecret123
  python screener_upload.py
"""

import io
import json
import os
import sys
import zipfile
from datetime import datetime, timedelta

import requests
from pykrx import stock


DART_API_KEY = os.environ.get("DART_API_KEY")
UPLOAD_SECRET = os.environ.get("UPLOAD_SECRET")
UPLOAD_URL = "https://600b-invest-screener.vercel.app/api/results/upload"


def ensure_env():
  if not DART_API_KEY:
    print("DART_API_KEY 환경변수가 필요합니다.", file=sys.stderr)
    sys.exit(1)
  if not UPLOAD_SECRET:
    print("UPLOAD_SECRET 환경변수가 필요합니다.", file=sys.stderr)
    sys.exit(1)


def fetch_corp_code_map() -> dict[str, str]:
  """DART corpCode.xml에서 stock_code -> corp_code 매핑 생성."""
  url = f"https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key={DART_API_KEY}"
  res = requests.get(url, timeout=30)
  res.raise_for_status()
  zf = zipfile.ZipFile(io.BytesIO(res.content))
  # ZIP 안의 첫 번째 XML 파일 사용
  xml_name = next((n for n in zf.namelist() if n.lower().endswith(".xml")), None)
  if not xml_name:
    raise RuntimeError("corpCode.xml ZIP 안에 XML 파일이 없습니다.")
  xml_bytes = zf.read(xml_name)

  import xml.etree.ElementTree as ET

  root = ET.fromstring(xml_bytes.decode("utf-8"))
  mapping: dict[str, str] = {}
  for el in root.findall(".//list"):
    stock_code = (el.findtext("stock_code") or "").strip()
    corp_code = (el.findtext("corp_code") or "").strip()
    if stock_code and stock_code != "-":
      mapping[stock_code] = corp_code
  return mapping


def fetch_dart_financials(corp_code: str, year: int | None = None):
  if year is None:
    year = datetime.today().year
  params = {
    "crtfc_key": DART_API_KEY,
    "corp_code": corp_code,
    "bsns_year": str(year),
    "reprt_code": "11011",  # 사업보고서
  }
  url = "https://opendart.fss.or.kr/api/fnlttSinglAcnt.json"
  res = requests.get(url, params=params, timeout=10)
  data = res.json()
  if data.get("status") != "000" or not isinstance(data.get("list"), list):
    # 전년도 한 번 더 시도
    if year > 2015:
      return fetch_dart_financials(corp_code, year - 1)
    return {"current_assets": None, "total_liabilities": None, "revenue": None}

  def find_amount(name: str) -> int | None:
    for row in data["list"]:
      if name in (row.get("account_nm") or "") and row.get("thstrm_amount"):
        try:
          return int(str(row["thstrm_amount"]).replace(",", ""))
        except ValueError:
          continue
    return None

  return {
    "current_assets": find_amount("유동자산"),
    "total_liabilities": find_amount("부채총계"),
    "revenue": find_amount("매출액") or find_amount("매출"),
  }


def calc_ma(series: list[int], n: int) -> float | None:
  if len(series) < n:
    return None
  window = series[-n:]
  return sum(window) / len(window)


def build_results():
  today = datetime.today()
  start = (today - timedelta(days=260)).strftime("%Y%m%d")
  end = today.strftime("%Y%m%d")

  print("DART corpCode.xml 다운로드 중...")
  stock_to_corp = fetch_corp_code_map()
  print(f"corpCode 매핑 {len(stock_to_corp)}개 로드")

  print("시가총액 데이터 로드 중...")
  mcap_df = stock.get_market_cap_by_ticker(end)

  markets = ["KOSPI", "KOSDAQ"]
  tickers: list[str] = []
  for m in markets:
    tickers.extend(stock.get_market_ticker_list(market=m))

  print(f"총 {len(tickers)}개 종목 처리 시작")

  items = []
  for i, ticker in enumerate(tickers, 1):
    try:
      corp_code = stock_to_corp.get(ticker)
      if not corp_code:
        continue

      ohlcv = stock.get_market_ohlcv_by_date(start, end, ticker)
      if ohlcv.empty:
        continue

      closes = ohlcv["종가"].astype(int).tolist()
      vols = ohlcv["거래량"].astype(int).tolist()

      price = closes[-1]
      low52w = min(closes)
      volume = vols[-1]
      ma20 = calc_ma(closes, 20)
      ma60 = calc_ma(closes, 60)
      ma120 = calc_ma(closes, 120)

      if ticker in mcap_df.index:
        mktcap = int(mcap_df.loc[ticker, "시가총액"])
      else:
        mktcap = None

      fin = fetch_dart_financials(corp_code)
      revenue = fin.get("revenue")
      current_assets = fin.get("current_assets")
      total_liab = fin.get("total_liabilities")

      if not revenue or not mktcap:
        continue

      psr = mktcap / revenue
      net_cash = (
        current_assets - total_liab
        if current_assets is not None and total_liab is not None
        else None
      )
      ncr = net_cash / mktcap if net_cash is not None and mktcap > 0 else -1

      # 기본 필터 (서버와 맞추거나 필요에 따라 수정)
      if psr > 0.8:
        continue
      if ncr < 0.0:
        continue
      if volume < 40 * 10_000:
        continue
      if mktcap < 50 * 100_000_000:
        continue

      row = {
        "ticker": ticker,
        "name": stock.get_market_ticker_name(ticker),
        "price": price,
        "mktcap": round(mktcap / 100_000_000),
        "volume": volume,
        "low52w": low52w,
        "psr": psr,
        "ncr": ncr,
        "ma20": ma20,
        "ma60": ma60,
        "ma120": ma120,
      }
      items.append(row)
    except Exception as e:
      print(f"[WARN] {ticker} 처리 중 오류: {e}", file=sys.stderr)
      continue

    if i % 50 == 0:
      print(f"{i}/{len(tickers)} 종목 처리 완료...")

  return items


def upload_results(items):
  payload = {
    "generatedAt": datetime.utcnow().isoformat() + "Z",
    "count": len(items),
    "items": items,
  }
  headers = {
    "Content-Type": "application/json",
    "UPLOAD_SECRET": UPLOAD_SECRET,
  }
  print(f"{len(items)}개 종목 업로드 중...")
  res = requests.post(UPLOAD_URL, headers=headers, data=json.dumps(payload, ensure_ascii=False).encode("utf-8"), timeout=60)
  print("응답 코드:", res.status_code)
  try:
    print("응답 본문:", res.json())
  except Exception:
    print("응답 본문(raw):", res.text)


if __name__ == "__main__":
  ensure_env()
  rows = build_results()
  upload_results(rows)

