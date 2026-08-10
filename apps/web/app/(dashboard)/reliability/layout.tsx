"use client";

import { FeatureGate } from "@/components/common/FeatureGate";
import { FLAG_KEYS } from "@agentcenter/utils";

export default function ReliabilityLayout({ children }: { children: React.ReactNode }) {
  return (
    <FeatureGate flag={FLAG_KEYS.TASK_AUTONOMY} featureName="Reliability">
      {children}
    </FeatureGate>
  );
}
