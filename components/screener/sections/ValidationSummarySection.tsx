"use client";

import styles from "../trust-sections.module.css";
import { validationNotes, validationStats } from "@/lib/screenerTrustContent";

export default function ValidationSummarySection() {
  return (
    <section className={styles.card}>
      <span className={styles.pill}>검증 요약</span>
      <h2 className={styles.sectionTitle}>전략 검증 요약</h2>
      <p className={styles.sectionDesc}>
        아래 수치는 현재 mock 기준입니다. 실제 백테스트 엔진/API로 교체될 수 있도록 데이터 분리 구조로 구성했습니다.
      </p>

      <div className={styles.statsRow}>
        {validationStats.map((stat) => (
          <article key={stat.label} className={styles.statBox}>
            <div className={styles.statLabel}>{stat.label}</div>
            <div className={styles.statValue}>{stat.value}</div>
            <p className={styles.statNote}>{stat.note}</p>
          </article>
        ))}
      </div>

      <ul className={styles.noteList}>
        {validationNotes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </section>
  );
}
