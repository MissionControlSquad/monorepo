"use client";

import { usePathname } from "next/navigation";
import { AgentsPanel } from "@/components/layout/sidebar/panels/AgentsPanel";

export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Show sidebar only on /agents/[id] detail pages, not on /agents, /agents/new, or /agents/[id]/setup
  const match = pathname?.match(/^\/agents\/([^/]+)$/);
  const isDetailPage = !!(match && match[1] !== "new");

  return (
    <div className="flex-1 flex min-h-0">
      {isDetailPage && (
        <aside className="w-64 h-full border-r border-border bg-background shrink-0 overflow-hidden hidden lg:block">
          <AgentsPanel />
        </aside>
      )}
      <div className="flex-1 flex flex-col min-w-0">{children}</div>
    </div>
  );
}
