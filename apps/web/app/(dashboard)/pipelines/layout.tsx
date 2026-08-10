"use client";

import { FeatureGate } from "@/components/common/FeatureGate";
import { FLAG_KEYS } from "@agentcenter/utils";

export default function PipelinesLayout({ children }: { children: React.ReactNode }) {
  return (
    <FeatureGate flag={FLAG_KEYS.PIPELINES_ROUTINES} featureName="Pipelines">
      {children}
    </FeatureGate>
  );
}
