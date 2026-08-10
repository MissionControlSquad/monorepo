"use client";

import { FeatureGate } from "@/components/common/FeatureGate";
import { FLAG_KEYS } from "@agentcenter/utils";

export default function AiToolsLayout({ children }: { children: React.ReactNode }) {
  return (
    <FeatureGate flag={FLAG_KEYS.AI_TOOLS} featureName="AI Tools">
      {children}
    </FeatureGate>
  );
}
