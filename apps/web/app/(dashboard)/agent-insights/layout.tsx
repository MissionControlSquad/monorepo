"use client";

import { FeatureGate } from "@/components/common/FeatureGate";
import { FLAG_KEYS } from "@agentcenter/utils";

export default function AgentInsightsLayout({ children }: { children: React.ReactNode }) {
  return (
    <FeatureGate flag={FLAG_KEYS.PRODUCTIVITY_REVIEW} featureName="Agent Insights">
      {children}
    </FeatureGate>
  );
}
