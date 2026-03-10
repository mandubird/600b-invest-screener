export type CaseStatus = "success" | "flat" | "fail";

export type StrategyTarget = {
  title: string;
  description: string;
};

export type ValidationStat = {
  label: string;
  value: string;
  note: string;
};

export type CaseItem = {
  name: string;
  period: string;
  status: CaseStatus;
  summary: string;
  lesson: string;
};

export type UsageStep = {
  step: string;
  title: string;
  detail: string;
};

export const positioningMessage = {
  title: "추천 서비스가 아닌 1차 필터 도구",
  body: "본 서비스는 투자 자문 또는 매수/매도 추천이 아니다. 스크리닝 결과는 저평가 후보를 발굴하기 위한 1차 필터다.",
};

export const strategyTargets: StrategyTarget[] = [
  {
    title: "매출 대비 저평가",
    description: "PSR이 낮아 동일 업종 대비 밸류에이션이 낮은 구간의 종목을 우선 탐색합니다.",
  },
  {
    title: "재무 완충력",
    description: "순현금비율(유동자산-부채총계/시가총액)이 높은 종목을 통해 하방 방어 가능성을 점검합니다.",
  },
  {
    title: "과열 회피",
    description: "거래량, 52주 저점 대비 괴리, 이동평균선 조건으로 급등 과열 구간을 1차로 제외합니다.",
  },
];

export const validationStats: ValidationStat[] = [
  {
    label: "관찰 기간",
    value: "2021.01 ~ 2025.12",
    note: "사이클 업/다운 구간을 모두 포함한 구간 가정",
  },
  {
    label: "관찰 샘플",
    value: "1,240 케이스",
    note: "조건 충족 시점 기준 후행 수익률 추적 mock",
  },
  {
    label: "중앙값 성과",
    value: "+8.4%",
    note: "6개월 보유 기준 중앙값(mock)",
  },
  {
    label: "손실 구간 비율",
    value: "34%",
    note: "업황 둔화/실적 역성장 구간 비중 포함",
  },
];

export const validationNotes: string[] = [
  "성공/실패 사례를 동시에 공개하며, 특정 구간의 초과수익만 강조하지 않습니다.",
  "과거 성과는 미래 수익을 보장하지 않는다.",
];

export const caseStudies: CaseItem[] = [
  {
    name: "A화학",
    period: "2023 Q4 진입",
    status: "success",
    summary: "저평가+순현금 조건 충족 후 업황 반등과 함께 7개월 동안 재평가 진행.",
    lesson: "밸류 저점 + 업황 반등 신호가 함께 나올 때 효율이 높았습니다.",
  },
  {
    name: "B기계",
    period: "2024 Q2 진입",
    status: "flat",
    summary: "저평가 구간 진입 후 실적 정체가 길어지며 6개월 동안 횡보.",
    lesson: "필터 통과 후에도 실적 모멘텀 확인이 없으면 시간 비용이 큽니다.",
  },
  {
    name: "C소재",
    period: "2022 Q3 진입",
    status: "fail",
    summary: "수치상 저평가였지만 수요 급감과 재고 부담으로 추가 하락.",
    lesson: "공시, 실적, 업황, 유동성, 리스크를 추가 확인해야 한다.",
  },
];

export const usageSteps: UsageStep[] = [
  {
    step: "1",
    title: "후보군 빠르게 추리기",
    detail: "기본 필터로 저평가 후보를 1차로 추린 뒤, 업종별로 묶어 확인합니다.",
  },
  {
    step: "2",
    title: "정성 검토로 걸러내기",
    detail: "최근 공시, 분기 실적, 업황 사이클, 거래대금, 리스크 이슈를 추가 확인합니다.",
  },
  {
    step: "3",
    title: "진입 시나리오 세우기",
    detail: "목표 보유 기간, 손절/익절 기준, 이벤트 캘린더를 사전에 정의합니다.",
  },
  {
    step: "4",
    title: "사후 기록 남기기",
    detail: "선정 근거와 결과를 남겨 필터 기준을 주기적으로 보정합니다.",
  },
];

export const limitations: string[] = [
  "본 서비스는 투자 자문 또는 매수/매도 추천이 아니다.",
  "스크리닝 결과는 저평가 후보를 발굴하기 위한 1차 필터다.",
  "공시, 실적, 업황, 유동성, 리스크를 추가 확인해야 한다.",
  "과거 성과는 미래 수익을 보장하지 않는다.",
];

export const dataCriteria = {
  sources: [
    "DART Open API: 유동자산, 부채총계, 매출액",
    "네이버 금융: 현재가, 거래량, 52주 저점, 이동평균선",
  ],
  updateRule: [
    "스크리닝 실행 시점에 서버에서 실시간 조회",
    "일부 지표는 공시 주기(분기/연간) 지연이 반영될 수 있음",
  ],
  formulas: [
    "PSR = 시가총액 / 매출액",
    "순현금비율 = (유동자산 - 부채총계) / 시가총액",
    "52주 저점 대비 = (현재가 - 52주 저가) / 52주 저가",
  ],
};

export const whyBuilt = {
  title: "왜 이 스크리너를 만들었나요?",
  body: "매번 수십 개 종목을 수작업으로 비교하는 시간을 줄이고, 사이클 저점 후보를 빠르게 찾기 위한 실무용 체크포인트를 만들기 위해 시작했습니다. 화려한 추천보다 재현 가능한 기준과 기록 가능한 프로세스를 우선합니다.",
};
