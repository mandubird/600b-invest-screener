"use client";

import styles from "../trust-sections.module.css";
import { whyBuilt } from "@/lib/screenerTrustContent";

export default function WhyBuiltSection() {
  return (
    <section className={styles.card}>
      <span className={styles.pill}>제작 철학</span>
      <h2 className={styles.sectionTitle}>{whyBuilt.title}</h2>
      <p className={styles.sectionDesc}>{whyBuilt.body}</p>
    </section>
  );
}
