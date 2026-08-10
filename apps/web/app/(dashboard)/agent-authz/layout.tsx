"use client";

import { FeatureGate } from "@/components/common/FeatureGate";
import { FLAG_KEYS } from "@agentcenter/utils";

export default function AgentAuthzLayout({ children }: { children: React.ReactNode }) {
  return (
    <FeatureGate flag={FLAG_KEYS.AGENT_AUTHZ} featureName="Agent Access">
      {children}
    </FeatureGate>
  );
}
