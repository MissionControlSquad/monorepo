"use client";

import { FeatureGate } from "@/components/common/FeatureGate";
import { FLAG_KEYS } from "@agentcenter/utils";

export default function InstructionsLayout({ children }: { children: React.ReactNode }) {
  return (
    <FeatureGate flag={FLAG_KEYS.AGENT_INSTRUCTIONS} featureName="Agent Instructions">
      {children}
    </FeatureGate>
  );
}
