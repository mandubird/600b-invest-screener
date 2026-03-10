"use client";

import styles from "./trust-sections.module.css";
import StrategyTargetSection from "./sections/StrategyTargetSection";
import ValidationSummarySection from "./sections/ValidationSummarySection";
import CaseStudiesSection from "./sections/CaseStudiesSection";
import UsageGuideSection from "./sections/UsageGuideSection";
import WhyBuiltSection from "./sections/WhyBuiltSection";

export default function TrustSections() {
  return (
    <section className={styles.wrap}>
      <StrategyTargetSection />
      <ValidationSummarySection />
      <CaseStudiesSection />
      <UsageGuideSection />
      <WhyBuiltSection />
    </section>
  );
}
