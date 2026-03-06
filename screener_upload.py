"""
로컬에서 실행하는 업로드 스크립트.

기능:
- pykrx로 KOSPI/KOSDAQ 종목의 주가·거래량·이평선 계산
- DART Open API로 유동자산, 부채총계, 매출액 조회
- PSR, 순현금비율 계산 및 필터링
- 결과를 JSON으로 만들어 Vercel API(/api/results/upload)에 업로드

환경변수 (.env 또는 export):
- DART_API_KEY: DART 오픈API 키
- UPLOAD_SECRET: /api/results/upload 에서 검증할 비밀 문자열
- BLOB_READ_WRITE_TOKEN: (선택) Vercel Blob 토큰. 업로드 API는 서버에서 사용.

설정 방법:
  .env.example 을 복사해 .env 로 저장한 뒤 값을 채우세요.
  pip install python-dotenv pykrx requests
  python screener_upload.py
"""

import io
import json
import os
import sys
import zipfile
from datetime import datetime, timedelta

from dotenv import load_dotenv

import requests
from pykrx import stock

# 프로젝트 루트의 .env 로드 (실행 위치와 관계없이 스크립트 기준으로 찾음)
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

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
  # DART는 오류 시 ZIP 대신 XML/HTML 에러 반환할 수 있음
  if not (res.content[:2] == b"PK"):
    try:
      err = res.text[:500] if res.text else res.content[:500]
      print(f"DART API 응답이 ZIP이 아닙니다. (API 키·일일 한도 확인)\n{err}", file=sys.stderr)
    except Exception:
      print("DART API 응답이 ZIP이 아닙니다. DART_API_KEY와 일일 한도를 확인하세요.", file=sys.stderr)
    sys.exit(1)
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


def _safe_num(row, key: str) -> int | float | None:
  """Series에서 key에 해당하는 값을 숫자로 반환. 없거나 변환 실패 시 None."""
  try:
    if key not in row.index:
      return None
    v = row[key]
    if v is None or (isinstance(v, float) and v != v):  # NaN
      return None
    if isinstance(v, (int, float)):
      return int(v) if isinstance(v, float) and v == int(v) else v
    return int(float(str(v).replace(",", "")))
  except (ValueError, TypeError, KeyError):
    return None


def get_latest_trading_date() -> str:
  """가장 최근 거래일(영업일)의 YYYYMMDD 문자열을 반환."""
  today = datetime.today().date()
  for i in range(10):
    day = today - timedelta(days=i)
    # 월(0)~금(5)만 시도
    if day.weekday() >= 5:
      continue
    day_str = day.strftime("%Y%m%d")
    # 대표 종목(삼성전자)으로 해당 일이 실제 거래일인지 확인
    df = stock.get_market_ohlcv_by_date(day_str, day_str, "005930")
    if not df.empty:
      return day_str
  # 10일 안에 못 찾으면 어제 날짜로 폴백
  return (today - timedelta(days=1)).strftime("%Y%m%d")


def build_results():
  end = get_latest_trading_date()
  end_dt = datetime.strptime(end, "%Y%m%d")
  start = (end_dt - timedelta(days=260)).strftime("%Y%m%d")

  print(f"스캔 기준일(최근 거래일): {end}")

  print("DART corpCode.xml 다운로드 중...")
  stock_to_corp = fetch_corp_code_map()
  print(f"corpCode 매핑 {len(stock_to_corp)}개 로드")

  print("OHLCV(시가총액) 데이터 로드 중...")
  try:
    df_ohlcv = stock.get_market_ohlcv_by_ticker(end, market="ALL")
  except Exception as e:
    print(
      f"시세 데이터를 pykrx에서 불러오지 못했습니다: {e}",
      file=sys.stderr,
    )
    sys.exit(1)
  # 실제 컬럼명 확인용
  print("df_ohlcv.columns:", df_ohlcv.columns.tolist())
  print("df_ohlcv.index.name:", df_ohlcv.index.name)
  if len(df_ohlcv) > 0:
    print("df_ohlcv 첫 행 샘플:", df_ohlcv.iloc[0].to_dict())

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

      # df_ohlcv에서 시가총액 또는 상장주식수×종가 (컬럼은 위 print로 확인)
      mktcap = None
      if ticker in df_ohlcv.index:
        row = df_ohlcv.loc[ticker]
        close_price = _safe_num(row, "종가") or price
        if "시가총액" in df_ohlcv.columns:
          mktcap = _safe_num(row, "시가총액")
        if mktcap is None and "상장주식수" in df_ohlcv.columns:
          shares = _safe_num(row, "상장주식수")
          if shares is not None and close_price is not None:
            mktcap = int(shares * close_price)

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

