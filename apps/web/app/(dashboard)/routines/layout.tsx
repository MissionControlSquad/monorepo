"use client";

import { FeatureGate } from "@/components/common/FeatureGate";
import { FLAG_KEYS } from "@agentcenter/utils";

export default function RoutinesLayout({ children }: { children: React.ReactNode }) {
  return (
    <FeatureGate flag={FLAG_KEYS.PIPELINES_ROUTINES} featureName="Routines">
      {children}
    </FeatureGate>
  );
}
