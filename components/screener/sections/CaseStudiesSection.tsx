"use client";

import styles from "../trust-sections.module.css";
import { caseStudies, type CaseStatus } from "@/lib/screenerTrustContent";

const badgeText: Record<CaseStatus, string> = {
  success: "success",
  flat: "flat",
  fail: "fail",
};

const badgeClass: Record<CaseStatus, string> = {
  success: styles.badgeSuccess,
  flat: styles.badgeFlat,
  fail: styles.badgeFail,
};

export default function CaseStudiesSection() {
  return (
    <section className={styles.card}>
      <span className={styles.pill}>사례 공개</span>
      <h2 className={styles.sectionTitle}>대표 사례</h2>
      <p className={styles.sectionDesc}>
        성공/횡보/실패 사례를 함께 제시해, 결과 해석을 균형 있게 보도록 구성했습니다.
      </p>

      <div className={styles.grid3}>
        {caseStudies.map((item) => (
          <article key={`${item.name}-${item.period}`} className={styles.caseCard}>
            <div className={styles.caseHead}>
              <div>
                <h3 className={styles.caseName}>{item.name}</h3>
                <p className={styles.casePeriod}>{item.period}</p>
              </div>
              <span className={`${styles.badge} ${badgeClass[item.status]}`}>
                {badgeText[item.status]}
              </span>
            </div>
            <p className={styles.itemText}>{item.summary}</p>
            <p className={styles.itemText}>핵심 포인트: {item.lesson}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
