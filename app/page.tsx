"use client";

import { useState, useCallback } from "react";

const DEFAULT_FILTERS = {
  psr_max: 0.4,
  cash_min: 0.1,
  volume_min: 100,
  mktcap_min: 50,
  low52w_pct: 20,
  ma_below: true,
};

const SIGNAL_COLOR: Record<string, string> = {
  "★ 강력매수": "#00ff88",
  "☆ 매수": "#60c0ff",
};

const SAMPLE_DATA = [
  { ticker: "006650", name: "대한유화", price: 58200, mktcap: 5964, volume: 182000, low52w: 52100, psr: 0.179, ncr: 0.362, ma20: 61200, ma60: 65800, ma120: 68400 },
  { ticker: "007370", name: "TYM", price: 7340, mktcap: 3045, volume: 1230000, low52w: 6890, psr: 0.32, ncr: 0.168, ma20: 7820, ma60: 8100, ma120: 8650 },
  { ticker: "066570", name: "LG전자(우)", price: 31550, mktcap: 8724, volume: 2340000, low52w: 29800, psr: 0.149, ncr: 0.491, ma20: 33400, ma60: 36100, ma120: 38200 },
  { ticker: "004840", name: "DRB동일", price: 4285, mktcap: 1284, volume: 1540000, low52w: 3990, psr: 0.214, ncr: 0.222, ma20: 4610, ma60: 4980, ma120: 5230 },
];

const fmt = (n: number | null | undefined, dec = 0) =>
  n == null ? "-" : Number(n).toLocaleString("ko-KR", { maximumFractionDigits: dec });

function signal(psr: number) {
  if (psr <= 0.2) return "★ 강력매수";
  if (psr <= 0.4) return "☆ 매수";
  return "-";
}

type Row = {
  ticker: string;
  name: string;
  price: number;
  mktcap: number;
  volume: number;
  low52w: number;
  low52pct?: string;
  psr: number;
  ncr: number;
  ma20: number;
  ma60: number;
  ma120: number;
  signal?: string;
};

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionTitle}>{title}</div>
      {children}
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
  warn,
  warnMsg,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  display: string;
  warn?: boolean;
  warnMsg?: string;
}) {
  return (
    <div style={styles.sliderRow}>
      <div style={styles.sliderLabelRow}>
        <span style={styles.sliderLabel}>{label}</span>
        <span style={{ ...styles.sliderVal, color: warn ? "#ff8060" : "#00ff88" }}>{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={styles.range}
        aria-label={label}
      />
      {warn && warnMsg && <div style={styles.warnMsg}>⚠ {warnMsg}</div>}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      role="switch"
      aria-checked={on}
      style={{
        ...styles.toggleTrack,
        background: on ? "#00ff8844" : "#333",
        border: `1px solid ${on ? "#00ff88" : "#555"}`,
      }}
      onClick={() => onChange(!on)}
    >
      <div
        style={{
          ...styles.toggleThumb,
          transform: on ? "translateX(18px)" : "translateX(2px)",
          background: on ? "#00ff88" : "#666",
        }}
      />
    </div>
  );
}

function GuideItem({ color, label, desc }: { color: string; label: string; desc: string }) {
  return (
    <div style={styles.guideItem}>
      <span style={{ ...styles.guideDot, background: color }} />
      <div>
        <div style={{ color, fontSize: 12, fontWeight: "bold" }}>{label}</div>
        <div style={{ color: "#888", fontSize: 11 }}>{desc}</div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    fontFamily: "'IBM Plex Mono', 'SF Mono', 'Courier New', monospace",
    background: "#080c12",
    color: "#ccd6e0",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    paddingLeft: "env(safe-area-inset-left)",
    paddingRight: "env(safe-area-inset-right)",
    paddingBottom: "env(safe-area-inset-bottom)",
  },
  header: {
    background: "linear-gradient(135deg, #0a1628 0%, #0d1f3c 100%)",
    borderBottom: "1px solid #1a3050",
    padding: "16px 16px 20px",
    paddingTop: "calc(12px + env(safe-area-inset-top))",
  },
  headerInner: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    maxWidth: 1400,
    margin: "0 auto",
    flexWrap: "wrap",
    gap: 8,
  },
  headerTag: { fontSize: 10, letterSpacing: 4, color: "#60c0ff", marginBottom: 4 },
  title: { margin: 0, fontSize: "clamp(18px, 5vw, 26px)", fontWeight: 700, color: "#e8f4ff", letterSpacing: 1 },
  subtitle: { margin: "2px 0 0", fontSize: 12, color: "#4a7fa8" },
  headerRight: { textAlign: "right" },
  statBox: { display: "flex", flexDirection: "column", alignItems: "flex-end" },
  statNum: { fontSize: 28, fontWeight: 700, color: "#00ff88", lineHeight: 1 },
  statLabel: { fontSize: 11, color: "#4a7fa8", marginTop: 2 },

  body: {
    display: "flex",
    flex: 1,
    maxWidth: 1400,
    margin: "0 auto",
    width: "100%",
    gap: 0,
    flexDirection: "column",
  },
  panel: {
    width: "100%",
    maxWidth: 320,
    margin: "0 auto",
    background: "#0a0e14",
    borderBottom: "1px solid #1a2535",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  panelTitle: { fontSize: 11, letterSpacing: 3, color: "#4a7fa8", marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid #1a2535" },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 10, color: "#60c0ff", letterSpacing: 2, marginBottom: 8, paddingBottom: 4, borderBottom: "1px solid #1a253560" },

  sliderRow: { marginBottom: 10 },
  sliderLabelRow: { display: "flex", justifyContent: "space-between", marginBottom: 4 },
  sliderLabel: { fontSize: 11, color: "#8aa8c0" },
  sliderVal: { fontSize: 11, fontWeight: "bold" },
  range: { width: "100%", accentColor: "#00ff88", height: 8, cursor: "pointer" },
  warnMsg: { fontSize: 10, color: "#ff8060", marginTop: 3 },

  toggleRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  toggleLabel: { fontSize: 11, color: "#8aa8c0" },
  toggleTrack: { width: 44, height: 24, borderRadius: 12, cursor: "pointer", position: "relative", transition: "all 0.2s", flexShrink: 0 },
  toggleThumb: { position: "absolute", top: 2, width: 20, height: 20, borderRadius: "50%", transition: "all 0.2s" },

  fixedBadge: { fontSize: 11, color: "#00ff88", background: "#00ff8818", border: "1px solid #00ff8840", borderRadius: 4, padding: "4px 8px", display: "inline-block" },

  runBtn: {
    background: "linear-gradient(135deg, #00cc66, #0088ff)",
    border: "none",
    borderRadius: 8,
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
    padding: "14px 0",
    cursor: "pointer",
    letterSpacing: 1,
    marginTop: 12,
    minHeight: 48,
    touchAction: "manipulation",
  },
  runBtnDisabled: { opacity: 0.7, cursor: "not-allowed" },
  spinner: { display: "inline-block", animation: "spin 1s linear infinite" },

  main: { flex: 1, padding: "16px", overflow: "auto", maxWidth: 1400, margin: "0 auto", width: "100%" },

  empty: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "40vh", gap: 16 },
  emptyIcon: { fontSize: 40, color: "#1a3050" },
  emptyText: { color: "#4a7fa8", fontSize: 14, textAlign: "center" },
  emptyHint: { color: "#1a3050", fontSize: 12, textAlign: "center" },

  loadingWrap: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: "40vh" },
  loadingAnim: { display: "flex", flexDirection: "column", gap: 10 },
  loadStep: { color: "#4a7fa8", fontSize: 13, animation: "fadeIn 0.4s ease both" },

  errorBox: { background: "#2a1510", border: "1px solid #ff8060", borderRadius: 8, padding: 12, marginBottom: 16, color: "#ff8060", fontSize: 13 },

  resultHeader: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, flexWrap: "wrap", gap: 4 },
  resultCount: { fontSize: 22, fontWeight: 700, color: "#00ff88" },
  resultLabel: { fontSize: 13, color: "#4a7fa8" },
  resultDate: { fontSize: 12, color: "#2a4a6a" },

  noResult: { textAlign: "center", color: "#4a5a6a", padding: "40px 0", fontSize: 14, lineHeight: 2 },

  tableWrap: { overflowX: "auto", WebkitOverflowScrolling: "touch", borderRadius: 8, border: "1px solid #1a2535", marginBottom: 16 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 640 },
  th: { background: "#0a1220", color: "#4a7fa8", padding: "10px 8px", textAlign: "left", cursor: "pointer", whiteSpace: "nowrap", borderBottom: "1px solid #1a2535", letterSpacing: 0.5, fontSize: 11 },
  tr: { transition: "background 0.1s" },
  td: { padding: "8px", color: "#c0d0e0", borderBottom: "1px solid #0d1520", whiteSpace: "nowrap", fontSize: 11 },
  tdName: { padding: "8px", color: "#e0eef8", fontWeight: "bold", borderBottom: "1px solid #0d1520", whiteSpace: "nowrap" },
  tickerBadge: { fontSize: 10, color: "#2a5a8a", background: "#0a1828", border: "1px solid #1a3050", borderRadius: 3, padding: "2px 4px", marginRight: 6 },

  guide: { marginTop: 16, background: "#0a0e14", border: "1px solid #1a2535", borderRadius: 8, padding: "14px" },
  guideTitle: { fontSize: 11, color: "#4a7fa8", letterSpacing: 2, marginBottom: 10 },
  guideGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  guideItem: { display: "flex", gap: 10, alignItems: "flex-start" },
  guideDot: { width: 8, height: 8, borderRadius: "50%", marginTop: 3, flexShrink: 0 },

  demoNote: { fontSize: 11, color: "#4a5a6a", marginTop: 8, padding: 8, background: "#0d1520", borderRadius: 6 },
};

export default function App() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [results, setResults] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<keyof Row>("psr");
  const [sortAsc, setSortAsc] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const updateFilter = (key: keyof typeof filters, val: number | boolean) =>
    setFilters((prev) => ({ ...prev, [key]: val }));

  const handleSort = (key: keyof Row) => {
    if (sortKey === key) setSortAsc((a) => !a);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const runScreener = useCallback(async () => {
    setLoading(true);
    setResults(null);
    setError(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10 * 60 * 1000);

    try {
      const res = await fetch("/api/screener/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filters),
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timeoutId);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "스크리닝 요청 실패");
        setResults([]);
        return;
      }

      const raw = (data.items || data.list || []) as any[];
      const list = raw.map((d: any) => ({
        ...d,
        low52pct: d.low52w > 0 ? ((d.price - d.low52w) / d.low52w * 100).toFixed(1) : "0",
        signal: signal(d.psr),
      }));
      setResults(list);
      setLastUpdated(data.generatedAt ?? new Date().toISOString());
    } catch (e) {
      clearTimeout(timeoutId);
      const isAbort = e instanceof Error && e.name === "AbortError";
      setError(isAbort ? "요청 시간이 초과되었습니다. 다시 시도해 주세요." : "네트워크 오류입니다. 다시 시도해 주세요.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const showDemo = useCallback(() => {
    setError(null);
    setLoading(true);
    setResults(null);
    setTimeout(() => {
      const filtered = SAMPLE_DATA.map((d) => ({
        ...d,
        low52pct: ((d.price - d.low52w) / d.low52w * 100).toFixed(1),
        signal: signal(d.psr),
      }));
      setResults(filtered);
      setLoading(false);
    }, 800);
  }, []);

  const sorted = results
    ? [...results].sort((a, b) => {
        const va = a[sortKey];
        const vb = b[sortKey];

        const numA =
          typeof va === "number"
            ? va
            : sortKey === "low52pct" && typeof va === "string"
              ? Number(va)
              : null;
        const numB =
          typeof vb === "number"
            ? vb
            : sortKey === "low52pct" && typeof vb === "string"
              ? Number(vb)
              : null;

        if (numA != null && numB != null && !Number.isNaN(numA) && !Number.isNaN(numB)) {
          return sortAsc ? numA - numB : numB - numA;
        }

        const strA = String(va ?? "");
        const strB = String(vb ?? "");
        const compared = strA.localeCompare(strB, "ko");
        return sortAsc ? compared : -compared;
      })
    : [];

  return (
    <div style={styles.root}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div>
            <div style={styles.headerTag}>CYCLICAL VALUE</div>
            <h1 style={styles.title}>써클리컬 가치 스크리너</h1>
            <p style={styles.subtitle}>PSR + 순현금비율 기반 저평가 종목 발굴</p>
          </div>
          <div style={styles.headerRight}>
            <div style={styles.statBox}>
              <span style={styles.statNum}>{results ? sorted.length : "—"}</span>
              <span style={styles.statLabel}>충족 종목</span>
            </div>
          </div>
        </div>
      </header>

      <div className="screener-body" style={styles.body}>
        <aside className="screener-panel" style={styles.panel}>
          <div style={styles.panelTitle}>⚙ 필터 설정</div>

          <FilterSection title="1차 — 가치 필터">
            <SliderRow
              label="PSR 상한"
              value={filters.psr_max}
              min={0.1}
              max={0.8}
              step={0.05}
              onChange={(v) => updateFilter("psr_max", v)}
              display={`≤ ${filters.psr_max.toFixed(2)}`}
              warn={filters.psr_max > 0.4}
              warnMsg="0.4 초과 시 원칙 이탈"
            />
            <SliderRow
              label="순현금비율 하한"
              value={filters.cash_min}
              min={0}
              max={0.5}
              step={0.05}
              onChange={(v) => updateFilter("cash_min", v)}
              display={`≥ ${filters.cash_min.toFixed(2)}`}
            />
          </FilterSection>

          <FilterSection title="2차 — 타이밍 필터">
            <SliderRow
              label="거래량 하한"
              value={filters.volume_min}
              min={10}
              max={500}
              step={10}
              onChange={(v) => updateFilter("volume_min", v)}
              display={`≥ ${fmt(filters.volume_min)}만주`}
            />
            <SliderRow
              label="시가총액 하한"
              value={filters.mktcap_min}
              min={10}
              max={500}
              step={10}
              onChange={(v) => updateFilter("mktcap_min", v)}
              display={`≥ ${fmt(filters.mktcap_min)}억`}
            />
            <SliderRow
              label="52주 저점 대비"
              value={filters.low52w_pct}
              min={5}
              max={50}
              step={5}
              onChange={(v) => updateFilter("low52w_pct", v)}
              display={`≤ +${filters.low52w_pct}%`}
            />
            <div style={styles.toggleRow}>
              <span style={styles.toggleLabel}>이평선(20/60/120) 아래</span>
              <Toggle on={filters.ma_below} onChange={(v) => updateFilter("ma_below", v)} />
            </div>
          </FilterSection>

          <FilterSection title="관리종목 제외">
            <div style={styles.fixedBadge}>✅ 항상 적용</div>
          </FilterSection>

          <button
            style={{ ...styles.runBtn, ...(loading ? styles.runBtnDisabled : {}) }}
            onClick={runScreener}
            disabled={loading}
          >
            {loading ? <span style={styles.spinner}>⟳</span> : "▶ 스크리닝 실행"}
          </button>

          <button
            type="button"
            style={{ ...styles.runBtn, background: "#333", marginTop: 8 }}
            onClick={showDemo}
            disabled={loading}
          >
            데모 결과 보기
          </button>

          <p style={styles.demoNote}>
            * 실제 데이터는 DART API 키를 Vercel 환경변수(DART_API_KEY)에 설정한 뒤 스크리닝 실행을 사용하세요.
          </p>
        </aside>

        <main style={styles.main}>
          {error && <div style={styles.errorBox}>{error}</div>}

          {!results && !loading && (
            <div style={styles.empty}>
              <div style={styles.emptyIcon}>◈</div>
              <p style={styles.emptyText}>필터를 설정하고 스크리닝을 실행하세요</p>
              <p style={styles.emptyHint}>
                PSR ≤ {filters.psr_max} · 순현금비율 ≥ {filters.cash_min} · 거래량 ≥ {filters.volume_min}만주
              </p>
            </div>
          )}

          {loading && (
            <div style={styles.loadingWrap}>
              <div style={styles.loadingAnim}>
                <div style={styles.loadStep}>스크리닝 중… (최대 5분 소요)</div>
              </div>
            </div>
          )}

          {results && !loading && (
            <>
              <div style={styles.resultHeader}>
                <div>
                  <span style={styles.resultCount}>{sorted.length}개</span>
                  <span style={styles.resultLabel}> 종목 발굴</span>
                </div>
                <div style={styles.resultDate}>
                  {lastUpdated
                    ? new Date(lastUpdated).toLocaleString("ko-KR", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "업데이트 정보 없음"}
                </div>
              </div>

              {sorted.length === 0 ? (
                <div style={styles.noResult}>
                  현재 조건을 충족하는 종목이 없습니다.
                  <br />
                  필터를 완화하거나 데모 결과 보기로 UI를 확인해 보세요.
                </div>
              ) : (
                <div style={styles.tableWrap}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        {[
                          ["name", "종목명"],
                          ["price", "현재가"],
                          ["mktcap", "시총(억)"],
                          ["volume", "거래량"],
                          ["low52pct", "52주저점"],
                          ["psr", "PSR"],
                          ["ncr", "순현금"],
                          ["signal", "시그널"],
                        ].map(([key, label]) => (
                          <th
                            key={key}
                            style={styles.th}
                            onClick={() => handleSort(key as keyof Row)}
                          >
                            {label} {sortKey === key ? (sortAsc ? "↑" : "↓") : ""}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((d, i) => (
                        <tr
                          key={d.ticker}
                          style={{
                            ...styles.tr,
                            background: i % 2 === 0 ? "#0d1117" : "#111820",
                          }}
                        >
                          <td style={styles.tdName}>
                            <span style={styles.tickerBadge}>{d.ticker}</span>
                            {d.name}
                          </td>
                          <td style={styles.td}>{fmt(d.price)}원</td>
                          <td style={styles.td}>{fmt(d.mktcap)}</td>
                          <td style={styles.td}>{fmt(d.volume)}</td>
                          <td style={{ ...styles.td, color: "#60c0ff" }}>
                            +{d.low52pct}%
                          </td>
                          <td
                            style={{
                              ...styles.td,
                              color: d.psr <= 0.2 ? "#00ff88" : "#fff",
                              fontWeight: "bold",
                            }}
                          >
                            {Number(d.psr).toFixed(3)}
                          </td>
                          <td
                            style={{
                              ...styles.td,
                              color: d.ncr >= 0.3 ? "#00ff88" : "#fff",
                            }}
                          >
                            {Number(d.ncr).toFixed(3)}
                          </td>
                          <td
                            style={{
                              ...styles.td,
                              color: SIGNAL_COLOR[d.signal || ""] || "#888",
                              fontWeight: "bold",
                            }}
                          >
                            {d.signal}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={styles.guide}>
                <div style={styles.guideTitle}>📌 매수 원칙</div>
                <div style={styles.guideGrid}>
                  <GuideItem color="#00ff88" label="★ 강력매수" desc="PSR ≤ 0.2 + 순현금비율 ≥ 0.1" />
                  <GuideItem color="#60c0ff" label="☆ 매수" desc="PSR ≤ 0.4 + 순현금비율 ≥ 0.1" />
                  <GuideItem color="#ffc060" label="1차 매도" desc="PSR 3배 증가 후" />
                  <GuideItem color="#ff6060" label="수익 실현" desc="15% 목표 달성 즉시" />
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
