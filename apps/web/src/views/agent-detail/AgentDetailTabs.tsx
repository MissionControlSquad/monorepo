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
import { Tooltip } from "@/components/ui";
import { AGENT_DETAIL_TABS, buildAgentDetailHref, type AgentDetailTab } from "./agent-detail-tabs";

const TAB_META: Record<
  AgentDetailTab,
  { label: string; icon: typeof LayoutDashboard; tip: string }
> = {
  overview: {
    label: "Overview",
    icon: LayoutDashboard,
    tip: "This agent's status, pay, queue, memory, trust, and what it's working on now.",
  },
  tasks: { label: "Tasks", icon: ClipboardList, tip: "Tasks currently assigned to this agent." },
  deliverables: {
    label: "Deliverables",
    icon: FileText,
    tip: "Work this agent has completed and handed back.",
  },
  activity: {
    label: "Activity",
    icon: Activity,
    tip: "A timeline of everything this agent has done recently.",
  },
  runs: {
    label: "Runs",
    icon: Cpu,
    tip: "Each execution this agent has run, with live and past transcripts.",
  },
  tools: {
    label: "Tools",
    icon: Wrench,
    tip: "Which tools this agent is allowed or blocked from using.",
  },
  settings: {
    label: "Settings",
    icon: Settings,
    tip: "Edit this agent's identity, role, and configuration.",
  },
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
          <Tooltip key={tab} content={meta.tip} side="bottom">
            <Link
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
          </Tooltip>
        );
      })}
    </div>
  );
}
