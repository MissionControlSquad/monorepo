"use client";

import { FeatureGate } from "@/components/common/FeatureGate";
import { FLAG_KEYS } from "@/lib/feature-flag-keys";
import { ChannelsLayoutProvider } from "@/components/channels/ChannelsLayoutContext";
import { ChannelsPanel } from "@/components/layout/sidebar/panels/ChannelsPanel";

export default function ChannelsLayout({ children }: { children: React.ReactNode }) {
  return (
    <FeatureGate flag={FLAG_KEYS.CHANNELS} featureName="Channels">
      <ChannelsLayoutProvider>
        <div className="flex-1 flex min-h-0">
          <aside className="w-64 h-full border-r border-border bg-background shrink-0 overflow-hidden hidden lg:block">
            <ChannelsPanel />
          </aside>
          <div className="flex-1 flex flex-col min-w-0">{children}</div>
        </div>
      </ChannelsLayoutProvider>
    </FeatureGate>
  );
}
