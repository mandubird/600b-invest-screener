"""
로컬에서만 사용하는 네이버/pykrx 기반 스크리너 예제.

주의:
- 이 파일은 Vercel 서버리스에서 사용하지 않습니다.
- 로컬 Python 환경에서만 실행하세요.

설치:
  pip install pykrx requests
"""

from datetime import datetime, timedelta

import requests
from pykrx import stock


def get_daily_from_naver(code: str, count: int = 260):
  """네이버 일봉 데이터 (백업용). pykrx가 동작하지 않을 때 참고용."""
  url = f"https://fchart.stock.naver.com/sise.nhn?symbol={code}&timeframe=day&count={count}&requestType=0"
  headers = {"User-Agent": "Mozilla/5.0 (compatible; 600b-invest-local/1.0)"}
  res = requests.get(url, headers=headers, timeout=10)
  res.raise_for_status()
  text = res.text
  import re

  prices = []
  vols = []
  for m in re.finditer(r'data="([^"]+)"', text):
    parts = m.group(1).split("|")
    if len(parts) < 6:
      continue
    close = int(parts[4])
    vol = int(parts[5])
    prices.append(close)
    vols.append(vol)
  return prices, vols


def simple_screener_kospi():
  today = datetime.today().strftime("%Y%m%d")
  tickers = stock.get_market_ticker_list(market="KOSPI")

  rows = []
  for ticker in tickers:
    try:
      df = stock.get_market_ohlcv_by_date(
        (datetime.today() - timedelta(days=260)).strftime("%Y%m%d"),
        today,
        ticker,
      )
      if df.empty:
        continue
      closes = df["종가"].tolist()
      vols = df["거래량"].tolist()
      price = closes[-1]
      low52w = min(closes)
      vol = vols[-1]
      ma20 = sum(closes[-20:]) / 20 if len(closes) >= 20 else None
      ma60 = sum(closes[-60:]) / 60 if len(closes) >= 60 else None
      ma120 = sum(closes[-120:]) / 120 if len(closes) >= 120 else None

      rows.append(
        {
          "ticker": ticker,
          "price": price,
          "low52w": low52w,
          "volume": vol,
          "ma20": ma20,
          "ma60": ma60,
          "ma120": ma120,
        }
      )
    except Exception:
      continue

  return rows


if __name__ == "__main__":
  data = simple_screener_kospi()
  print(f"총 {len(data)}개 종목 계산 완료")
  # 필요하면 CSV 등으로 저장

