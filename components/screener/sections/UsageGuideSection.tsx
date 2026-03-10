"use client";

import styles from "../trust-sections.module.css";
import DataCriteriaPanel from "./DataCriteriaPanel";
import { limitations, usageSteps } from "@/lib/screenerTrustContent";

export default function UsageGuideSection() {
  return (
    <section className={styles.card}>
      <span className={styles.pill}>사용 가이드</span>
      <h2 className={styles.sectionTitle}>이 도구는 이렇게 사용하세요</h2>
      <p className={styles.sectionDesc}>
        추천을 받는 도구가 아니라, 후보를 압축한 뒤 직접 검토하기 위한 워크플로우 중심 도구입니다.
      </p>

      <div className={styles.grid2}>
        {usageSteps.map((step) => (
          <article key={step.step} className={styles.stepItem}>
            <div className={styles.stepNum}>{step.step}</div>
            <div>
              <h3 className={styles.itemTitle}>{step.title}</h3>
              <p className={styles.itemText}>{step.detail}</p>
            </div>
          </article>
        ))}
      </div>

      <div className={styles.disclaimer}>
        <h3 className={styles.disclaimerTitle}>한계 및 주의사항</h3>
        <ul className={styles.disclaimerList}>
          {limitations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <DataCriteriaPanel />
    </section>
  );
}
