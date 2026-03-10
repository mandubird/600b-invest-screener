"use client";

import styles from "../trust-sections.module.css";
import { positioningMessage, strategyTargets } from "@/lib/screenerTrustContent";

export default function StrategyTargetSection() {
  return (
    <section className={styles.card}>
      <span className={styles.pill}>전략 정의</span>
      <h2 className={styles.sectionTitle}>이 전략은 어떤 종목을 찾나요?</h2>
      <p className={styles.sectionDesc}>{positioningMessage.body}</p>

      <div className={styles.grid3}>
        {strategyTargets.map((item) => (
          <article key={item.title} className={styles.item}>
            <h3 className={styles.itemTitle}>{item.title}</h3>
            <p className={styles.itemText}>{item.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
