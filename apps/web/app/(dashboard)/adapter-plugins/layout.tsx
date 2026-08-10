"use client";

import { FeatureGate } from "@/components/common/FeatureGate";
import { FLAG_KEYS } from "@agentcenter/utils";

export default function AdapterPluginsLayout({ children }: { children: React.ReactNode }) {
  return (
    <FeatureGate flag={FLAG_KEYS.ADAPTER_PLUGINS} featureName="Adapter Plugins">
      {children}
    </FeatureGate>
  );
}
