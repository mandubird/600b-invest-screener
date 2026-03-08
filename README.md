# 써클리컬 가치 스크리너

한국 주식 가치투자 스크리너 웹앱입니다.  
**PSR**(시가총액/매출액)과 **순현금비율** 기반으로 저평가 종목을 발굴하며, 아이폰 사파리에서 매일 조건에 맞는 종목을 확인하는 용도로 사용할 수 있습니다.

- **DART Open API**: 재무 데이터(유동자산, 부채총계, 매출액)
- **네이버 금융 일봉**: 주가, 거래량, 52주 저점, 이평선(20/60/120) (메인/API)
- **pykrx + 로컬 업로드**: `screener_upload.py` → POST `/api/results/upload` → Vercel Blob
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
DART_API_KEY=your_dart_api_key_here
```

### 3. 개발 서버

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 접속.

- **메인 (/)** : **POST /api/screener/run** (네이버 실시간 스크리닝). 필터 전송 후 서버에서 DART+네이버로 실행
- **로컬 (/local)** : **GET /api/results/latest** (파이썬 업로드 결과). Blob에서 불러와 프론트 필터. 데이터 없으면 `run_screener.command` 실행 안내

---

## 로컬 업로드 스크립트 (결과 JSON 업로드)

Vercel에 스크리닝 결과를 올리려면 `screener_upload.py` 를 사용합니다.  
환경변수는 **프로젝트 루트의 `.env`** 에 두면 실행할 때마다 자동으로 읽습니다.

1. **`.env` 설정**
   - `.env.example` 을 복사해 `.env` 로 저장
   - `UPLOAD_SECRET`, `DART_API_KEY` (필수) 값을 채움  
   - `.env` 는 Git에 올라가지 않습니다 (`.gitignore`에 포함됨)

2. **의존성 및 실행**
   ```bash
   pip install -r requirements.txt
   python screener_upload.py
   ```

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
git remote add origin https://github.com/mandubird/600b-invest-screener.git
git push -u origin main
```

(저장소 URL은 본인 계정/저장소 이름에 맞게 바꾸세요.)

### 3. Vercel에 배포

1. [Vercel](https://vercel.com) 로그인 (GitHub 계정 연동 권장)
2. **Add New** → **Project**
3. **Import** 할 GitHub 저장소 선택 후 **Import**
4. **Environment Variables** 에서 변수 추가 (아래 "Vercel 환경변수 설정" 참고)
5. **Deploy** 클릭

배포가 끝나면 `https://프로젝트명.vercel.app` 형태의 URL이 생성됩니다.

#### Vercel 환경변수 설정

| Key | 설명 |
|-----|------|
| `DART_API_KEY` | [DART Open API](https://opendart.fss.or.kr) 인증키 (40자) |
| `UPLOAD_SECRET` | `/api/results/upload` 인증용 비밀 문자열 (예: screener2026). 로컬 `.env`와 동일하게 설정 |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob 저장소 연결 시 대시보드에서 자동 부여 |

1. Vercel 대시보드 → 해당 프로젝트 → **Settings** → **Environment Variables** 에서 위 변수 추가
2. **Save** 후 **Deployments** 탭에서 **Redeploy** 하면 적용됩니다.

### 4. 아이폰에서 사용

- 사파리에서 해당 URL 접속
- **공유** → **홈 화면에 추가** 로 앱처럼 사용 가능 (풀스크린, 주소창 숨김)

---

## 프로젝트 구조

```
├── app/
│   ├── api/
│   │   ├── company/
│   │   │   └── list/route.ts        # GET /api/company/list (상장사 목록)
│   │   ├── dart/
│   │   │   ├── companies/route.ts   # DART 회사 목록
│   │   │   └── financials/route.ts # DART 재무 (유동자산, 부채총계, 매출액)
│   │   ├── stock/
│   │   │   └── quote/route.ts      # 네이버 금융 일봉 주가·거래량·이평
│   │   ├── results/
│   │   │   ├── upload/route.ts    # POST 업로드 (UPLOAD_SECRET 검증 → Vercel Blob)
│   │   │   └── latest/route.ts    # GET 최신 결과 (Blob)
│   │   └── screener/
│   │       └── run/route.ts       # 스크리닝 실행 (POST)
│   ├── local/
│   │   └── page.tsx               # /local — 업로드 결과 + 프론트 필터
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
- 스크리닝은 상장사 중 최대 10종목만 검사합니다. Vercel 서버리스 타임아웃(무료 10초, Pro 60초) 내에 완료되도록 조정되어 있습니다.

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
