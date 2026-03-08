"use client";

import { usePathname } from "next/navigation";
import { CloudPanel } from "@/components/layout/sidebar/panels/CloudPanel";
import { FeatureGate } from "@/components/common/FeatureGate";
import { FLAG_KEYS } from "@/lib/feature-flag-keys";

export default function CloudLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDetailPage = pathname !== "/cloud" && pathname?.startsWith("/cloud/");

  return (
    <FeatureGate flag={FLAG_KEYS.CLOUD_VMS} featureName="Cloud VMs">
      <div className="flex-1 flex min-h-0">
        {isDetailPage && (
          <aside className="w-64 h-full border-r border-border bg-background shrink-0 overflow-hidden hidden lg:block">
            <CloudPanel />
          </aside>
        )}
        <div className="flex-1 flex flex-col min-w-0">{children}</div>
      </div>
    </FeatureGate>
  );
}
