"use client";

import { FeatureGate } from "@/components/common/FeatureGate";
import { FLAG_KEYS } from "@agentcenter/utils";

export default function AttentionLayout({ children }: { children: React.ReactNode }) {
  return (
    <FeatureGate flag={FLAG_KEYS.ATTENTION} featureName="Attention">
      {children}
    </FeatureGate>
  );
}
