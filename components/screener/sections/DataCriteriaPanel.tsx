"use client";

import styles from "../trust-sections.module.css";
import { dataCriteria } from "@/lib/screenerTrustContent";

export default function DataCriteriaPanel() {
  return (
    <details className={styles.criteriaToggle}>
      <summary className={styles.criteriaSummary}>데이터 기준 보기</summary>
      <div className={styles.criteriaBody}>
        <div>
          <h4 className={styles.criteriaHead}>데이터 출처</h4>
          <ul className={styles.criteriaList}>
            {dataCriteria.sources.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className={styles.criteriaHead}>업데이트 기준</h4>
          <ul className={styles.criteriaList}>
            {dataCriteria.updateRule.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className={styles.criteriaHead}>계산 기준</h4>
          <ul className={styles.criteriaList}>
            {dataCriteria.formulas.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}
