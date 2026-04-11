"use client";

import { LiveGatewayPanel } from "@/components/layout/sidebar/panels/LiveGatewayPanel";
import { FeatureGate } from "@/components/common/FeatureGate";
import { FLAG_KEYS } from "@agentcenter/utils";

export default function LiveGatewayLayout({ children }: { children: React.ReactNode }) {
  return (
    <FeatureGate flag={FLAG_KEYS.LIVE_GATEWAY} featureName="Live Gateway">
      <div className="flex-1 flex min-h-0">
        <aside className="w-64 h-full border-r border-border bg-background shrink-0 overflow-hidden hidden lg:block">
          <LiveGatewayPanel />
        </aside>
        <div className="flex-1 flex flex-col min-w-0">{children}</div>
      </div>
    </FeatureGate>
  );
}
