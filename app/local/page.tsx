"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

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
  mktcap: number | null;
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

function applyFilters(rows: Row[], filters: typeof DEFAULT_FILTERS): Row[] {
  return rows.filter((d) => {
    const low52pct = d.low52w > 0 ? ((d.price - d.low52w) / d.low52w) * 100 : 0;
    const volMin = filters.volume_min * 10000;
    const maBelow =
      d.ma20 != null && d.ma60 != null && d.ma120 != null &&
      d.price < d.ma20 && d.price < d.ma60 && d.price < d.ma120;
    if (d.psr > filters.psr_max) return false;
    if (d.ncr < filters.cash_min) return false;
    if (d.volume < volMin) return false;
    if (d.mktcap != null && d.mktcap < filters.mktcap_min) return false;
    if (low52pct > filters.low52w_pct) return false;
    if (filters.ma_below && !maBelow) return false;
    return true;
  });
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
  dateBadge: { fontSize: 13, color: "#e8f4ff", marginTop: 6 },

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

  main: { flex: 1, padding: "16px", overflow: "auto", maxWidth: 1400, margin: "0 auto", width: "100%" },
  empty: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "40vh", gap: 16 },
  emptyIcon: { fontSize: 40, color: "#1a3050" },
  emptyText: { color: "#4a7fa8", fontSize: 14, textAlign: "center" },
  emptyHint: { color: "#1a3050", fontSize: 12, textAlign: "center" },
  runScreenerHint: { marginTop: 12, padding: 14, background: "#0a1628", border: "1px solid #1a3050", borderRadius: 8, color: "#60c0ff", fontSize: 13, textAlign: "center" },
  link: { color: "#00ff88", textDecoration: "underline" },

  loadingWrap: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: "40vh" },
  loadStep: { color: "#4a7fa8", fontSize: 13 },

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
};

export default function LocalPage() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [rawRows, setRawRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateLabel, setDateLabel] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<keyof Row>("psr");
  const [sortAsc, setSortAsc] = useState(true);

  const updateFilter = (key: keyof typeof filters, val: number | boolean) =>
    setFilters((prev) => ({ ...prev, [key]: val }));

  const handleSort = (key: keyof Row) => {
    if (sortKey === key) setSortAsc((a) => !a);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const loadLatest = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRawRows(null);
    setDateLabel(null);
    try {
      const res = await fetch("/api/results/latest", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "데이터를 불러오지 못했습니다.");
        return;
      }
      const items = (data.items ?? data.list ?? []) as Row[];
      const rows = items.map((d) => ({
        ...d,
        mktcap: d.mktcap ?? null,
        low52pct: d.low52w > 0 ? ((d.price - d.low52w) / d.low52w * 100).toFixed(1) : "0",
        signal: signal(d.psr),
      }));
      setRawRows(rows);
      const at = data.generatedAt ?? data.uploadedAt ?? data.date;
      if (at) {
        const d = new Date(at);
        setDateLabel(`${d.getMonth() + 1}월 ${d.getDate()}일 종가 기준`);
      } else {
        setDateLabel(null);
      }
    } catch (e) {
      setError("네트워크 오류입니다. 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLatest();
  }, [loadLatest]);

  const filtered = rawRows ? applyFilters(rawRows, filters) : [];
  const sorted = [...filtered].sort((a, b) => {
    const v = (x: Row) => (typeof x[sortKey] === "number" ? x[sortKey] : 0) as number;
    return sortAsc ? v(a) - v(b) : v(b) - v(a);
  });

  return (
    <div style={styles.root}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div>
            <div style={styles.headerTag}>LOCAL</div>
            <h1 style={styles.title}>로컬 스크리너 결과</h1>
            <p style={styles.subtitle}>업로드된 결과 기준 · 프론트 필터</p>
            {dateLabel && <p style={styles.dateBadge}>📅 {dateLabel}</p>}
          </div>
          <div style={styles.headerRight}>
            <div style={styles.statBox}>
              <span style={styles.statNum}>{rawRows ? sorted.length : "—"}</span>
              <span style={styles.statLabel}>충족 종목</span>
            </div>
          </div>
        </div>
      </header>

      <div style={styles.body}>
        <aside style={styles.panel}>
          <div style={styles.panelTitle}>⚙ 필터 (프론트)</div>
          <FilterSection title="1차 — 가치 필터">
            <SliderRow
              label="PSR 상한"
              value={filters.psr_max}
              min={0.1}
              max={0.8}
              step={0.05}
              onChange={(v) => updateFilter("psr_max", v)}
              display={`≤ ${filters.psr_max.toFixed(2)}`}
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
          <div style={styles.fixedBadge}>클라이언트 필터</div>
          <Link href="/" style={{ ...styles.link, display: "block", marginTop: 12 }}>
            ← 메인 페이지
          </Link>
        </aside>

        <main style={styles.main}>
          {error && (
            <div style={{ ...styles.empty, flexDirection: "column", gap: 12 }}>
            <p style={styles.emptyText}>{error}</p>
            <p style={styles.runScreenerHint}>
              run_screener.command 를 실행해 주세요.
            </p>
            <button
              type="button"
              onClick={loadLatest}
              style={{
                padding: "10px 20px",
                background: "#1a3050",
                border: "1px solid #2a4a70",
                borderRadius: 8,
                color: "#60c0ff",
                cursor: "pointer",
              }}
            >
              다시 불러오기
            </button>
          </div>
          )}

          {loading && !error && (
            <div style={styles.loadingWrap}>
              <span style={styles.loadStep}>데이터 불러오는 중…</span>
            </div>
          )}

          {!loading && !error && rawRows && (
            <>
              {rawRows.length === 0 ? (
                <div style={styles.empty}>
                  <p style={styles.emptyText}>업로드된 데이터가 없습니다.</p>
                  <p style={styles.runScreenerHint}>
                    run_screener.command 를 실행해 주세요.
                  </p>
                </div>
              ) : (
                <>
                  <div style={styles.resultHeader}>
                    <div>
                      <span style={styles.resultCount}>{sorted.length}개</span>
                      <span style={styles.resultLabel}> 종목 (필터 적용)</span>
                    </div>
                  </div>
                  {sorted.length === 0 ? (
                    <div style={styles.noResult}>
                      현재 필터 조건을 충족하는 종목이 없습니다. 슬라이더를 완화해 보세요.
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
                              <td style={{ ...styles.td, color: "#60c0ff" }}>+{d.low52pct}%</td>
                              <td style={{ ...styles.td, color: d.psr <= 0.2 ? "#00ff88" : "#fff", fontWeight: "bold" }}>
                                {Number(d.psr).toFixed(3)}
                              </td>
                              <td style={{ ...styles.td, color: d.ncr >= 0.3 ? "#00ff88" : "#fff" }}>
                                {Number(d.ncr).toFixed(3)}
                              </td>
                              <td style={{ ...styles.td, color: SIGNAL_COLOR[d.signal || ""] || "#888", fontWeight: "bold" }}>
                                {d.signal}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
