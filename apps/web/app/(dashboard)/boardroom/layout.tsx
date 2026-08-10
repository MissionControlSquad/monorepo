"use client";

import { FeatureGate } from "@/components/common/FeatureGate";
import { FLAG_KEYS } from "@agentcenter/utils";

export default function BoardroomLayout({ children }: { children: React.ReactNode }) {
  return (
    <FeatureGate flag={FLAG_KEYS.BOARD_CHAT} featureName="Boardroom">
      {children}
    </FeatureGate>
  );
}
