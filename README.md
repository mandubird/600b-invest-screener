# 써클리컬 가치 스크리너

한국 주식 가치투자 스크리너 웹앱입니다.  
**PSR**(시가총액/매출액)과 **순현금비율** 기반으로 저평가 종목을 발굴하며, 아이폰 사파리에서 매일 조건에 맞는 종목을 확인하는 용도로 사용할 수 있습니다.

- **DART Open API**: 재무 데이터(유동자산, 부채총계, 매출액)
- **Yahoo Finance**: 주가, 거래량, 52주 저점, 이평선(20/60/120)
- **Next.js + Vercel** 배포

---

## 스크리닝 조건 (기본값)

| 조건 | 기본값 |
|------|--------|
| PSR | ≤ 0.4 |
| 순현금비율 | ≥ 0.1 |
| 거래량 | ≥ 100만주 |
| 시가총액 | ≥ 50억원 |
| 52주 저점 대비 | 20% 이내 |
| 20/60/120 이평선 | 현재가가 모두 아래 |
| 관리종목 | 제외 |

---

## 로컬 실행

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경변수 (선택)

DART API 키가 없으면 **데모 결과 보기**로 샘플 데이터만 확인할 수 있습니다.  
실제 스크리닝을 하려면 [DART Open API](https://opendart.fss.or.kr)에서 인증키를 발급받아 설정하세요.

```bash
# .env.local
DART_API_KEY=발급받은_40자리_인증키
```

### 3. 개발 서버

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 접속.

---

## GitHub + Vercel 배포

### 1. GitHub 저장소 만들기

1. [GitHub](https://github.com) 로그인 후 **New repository** 생성
2. 저장소 이름 예: `600b-invest-screener`
3. **Create repository** 클릭

### 2. 프로젝트를 GitHub에 푸시

```bash
cd /Users/gimmingyu/Desktop/2025/600b_invest

git init
git add .
git commit -m "Initial commit: cyclical value screener"
git branch -M main
git remote add origin https://github.com/당신의유저명/600b-invest-screener.git
git push -u origin main
```

(저장소 URL은 본인 계정/저장소 이름에 맞게 바꾸세요.)

### 3. Vercel에 배포

1. [Vercel](https://vercel.com) 로그인 (GitHub 계정 연동 권장)
2. **Add New** → **Project**
3. **Import** 할 GitHub 저장소 선택 후 **Import**
4. **Environment Variables** 에서 변수 추가:
   - **Name**: `DART_API_KEY`
   - **Value**: DART에서 발급한 40자리 인증키
5. **Deploy** 클릭

배포가 끝나면 `https://프로젝트명.vercel.app` 형태의 URL이 생성됩니다.

### 4. 아이폰에서 사용

- 사파리에서 해당 URL 접속
- **공유** → **홈 화면에 추가** 로 앱처럼 사용 가능 (풀스크린, 주소창 숨김)

---

## 프로젝트 구조

```
├── app/
│   ├── api/
│   │   ├── dart/
│   │   │   ├── companies/route.ts   # DART 회사 목록
│   │   │   └── financials/route.ts # DART 재무 (유동자산, 부채총계, 매출액)
│   │   ├── stock/
│   │   │   └── quote/route.ts      # Yahoo Finance 주가·거래량·이평
│   │   └── screener/
│   │       └── run/route.ts         # 스크리닝 실행 (POST)
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── lib/
│   └── managedStocks.ts            # 관리종목 제외 목록 (수동 갱신)
├── next.config.js
├── package.json
├── tsconfig.json
└── README.md
```

- **DART API 키**는 코드에 넣지 않고 **Vercel 환경변수** `DART_API_KEY` 로만 사용합니다.
- API 라우트는 같은 도메인에서만 호출되므로 CORS 설정은 필요 없습니다.
- 스크리닝은 상장사 중 최대 120종목만 검사합니다. Vercel 서버리스 타임아웃(무료 10초, Pro 60초) 내에 완료되도록 조정되어 있습니다.

---

## 지표 설명

- **PSR** = 시가총액 ÷ 매출액 (낮을수록 매출 대비 저평가)
- **순현금비율** = (유동자산 − 부채총계) ÷ 시가총액 (높을수록 재무 안정성·현금 여력 양호)
- **52주 저점 대비** = (현재가 − 52주 저가) ÷ 52주 저가 (낮을수록 저점 근처)

---

## 관리종목 제외

`lib/managedStocks.ts` 의 `MANAGED_STOCK_CODES` 에 제외할 종목코드를 추가하면 스크리닝에서 제외됩니다.  
KRX 관리종목·지정종목 목록은 [KRX 데이터포털](https://data.krx.co.kr) 등을 참고해 수동으로 갱신할 수 있습니다.

---

## 라이선스

ISC
