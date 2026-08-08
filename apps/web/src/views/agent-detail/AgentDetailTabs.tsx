"use client";

import Link from "next/link";
import {
  Activity,
  ClipboardList,
  Cpu,
  FileText,
  LayoutDashboard,
  Settings,
  Wrench,
} from "lucide-react";
import { AGENT_DETAIL_TABS, buildAgentDetailHref, type AgentDetailTab } from "./agent-detail-tabs";

const TAB_META: Record<AgentDetailTab, { label: string; icon: typeof LayoutDashboard }> = {
  overview: { label: "Overview", icon: LayoutDashboard },
  tasks: { label: "Tasks", icon: ClipboardList },
  deliverables: { label: "Deliverables", icon: FileText },
  activity: { label: "Activity", icon: Activity },
  runs: { label: "Runs", icon: Cpu },
  tools: { label: "Tools", icon: Wrench },
  settings: { label: "Settings", icon: Settings },
};

// URL-driven tab bar for Agent Detail. Each tab is a real Link (`?tab=`), so tabs are shareable,
// back/forward works, and there is no client-only tab state. Horizontally scrollable on narrow widths.
export function AgentDetailTabs({
  agentId,
  activeTab,
}: {
  agentId: string;
  activeTab: AgentDetailTab;
}) {
  return (
    <div
      role="tablist"
      aria-label="Agent sections"
      className="flex gap-1 overflow-x-auto border-b border-border"
    >
      {AGENT_DETAIL_TABS.map((tab) => {
        const meta = TAB_META[tab];
        const Icon = meta.icon;
        const isActive = tab === activeTab;
        return (
          <Link
            key={tab}
            href={buildAgentDetailHref(agentId, tab)}
            role="tab"
            aria-selected={isActive}
            aria-current={isActive ? "page" : undefined}
            className={`flex flex-shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition ${
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            <span>{meta.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
