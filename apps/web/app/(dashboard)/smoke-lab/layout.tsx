"use client";

import { FeatureGate } from "@/components/common/FeatureGate";
import { FLAG_KEYS } from "@agentcenter/utils";

export default function SmokeLabLayout({ children }: { children: React.ReactNode }) {
  return (
    <FeatureGate flag={FLAG_KEYS.SMOKE_LAB} featureName="Smoke Lab">
      {children}
    </FeatureGate>
  );
}
