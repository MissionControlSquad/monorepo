"use client";

import { FeatureGate } from "@/components/common/FeatureGate";
import { FLAG_KEYS } from "@agentcenter/utils";

export default function CloudUpstreamsLayout({ children }: { children: React.ReactNode }) {
  return (
    <FeatureGate flag={FLAG_KEYS.CLOUD_UPSTREAMS} featureName="Cloud Upstreams">
      {children}
    </FeatureGate>
  );
}
