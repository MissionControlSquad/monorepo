"use client";

import {
  Brain,
  Code,
  Search,
  BookOpen,
  Rocket,
  TestTube2,
  PenTool,
  Clock,
  MessageCircle,
  Link,
  Zap,
  AlertCircle,
  Circle,
  WifiOff,
} from "lucide-react";
import {
  AGENT_STATUSES,
  AGENT_DETAILED_STATUSES,
  STATUS_BADGE_CLASSES,
  STATUS_DOT_CLASSES,
  type AgentDetailedStatus,
} from "../../lib/constants";
import type { AgentStatusValue } from "@/server/constants";

const ICON_MAP: Record<string, any> = {
  Brain,
  Code,
  Search,
  BookOpen,
  Rocket,
  TestTube: TestTube2,
  PenTool,
  Clock,
  MessageCircle,
  Link,
  Zap,
  AlertCircle,
  Circle,
};

interface AgentStatusBadgeProps {
  status: AgentStatusValue;
  detailedStatus?: AgentDetailedStatus;
  isOnline: boolean;
  size?: "sm" | "md";
}

export function AgentStatusBadge({
  status,
  detailedStatus,
  isOnline,
  size = "sm",
}: AgentStatusBadgeProps) {
  if (!isOnline) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE_CLASSES.offline}`}
      >
        <WifiOff className={size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5"} />
        Offline
      </span>
    );
  }

  // Use detailed status if available
  if (detailedStatus && detailedStatus in AGENT_DETAILED_STATUSES) {
    const config = AGENT_DETAILED_STATUSES[detailedStatus];
    const Icon = ICON_MAP[config.icon] || Circle;
    const badgeClass = STATUS_BADGE_CLASSES[detailedStatus] || STATUS_BADGE_CLASSES.active;

    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badgeClass}`}
      >
        <Icon className={size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5"} />
        {config.label}
      </span>
    );
  }

  // Fall back to base status
  const config = AGENT_STATUSES[status];
  const Icon = ICON_MAP[config.icon] || Circle;
  const badgeClass = STATUS_BADGE_CLASSES[status] || STATUS_BADGE_CLASSES.idle;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badgeClass}`}
    >
      <Icon className={size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5"} />
      {config.label}
    </span>
  );
}

interface StatusDotProps {
  status: AgentStatusValue;
  detailedStatus?: AgentDetailedStatus;
  isOnline: boolean;
  className?: string;
}

export function StatusDot({ status, detailedStatus, isOnline, className = "" }: StatusDotProps) {
  if (!isOnline) {
    return (
      <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT_CLASSES.offline} ${className}`} />
    );
  }

  const dotKey = detailedStatus && detailedStatus in STATUS_DOT_CLASSES ? detailedStatus : status;

  return (
    <span
      className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT_CLASSES[dotKey] || STATUS_DOT_CLASSES.idle} ${className}`}
    />
  );
}
