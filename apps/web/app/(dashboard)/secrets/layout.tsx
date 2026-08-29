"use client";

import { FeatureGate } from "@/components/common/FeatureGate";
import { FLAG_KEYS } from "@agentcenter/utils";

export default function SecretsLayout({ children }: { children: React.ReactNode }) {
  return (
    <FeatureGate flag={FLAG_KEYS.SECRETS_VAULT} featureName="Secrets">
      {children}
    </FeatureGate>
  );
}
