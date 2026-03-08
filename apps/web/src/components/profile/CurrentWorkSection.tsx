"use client";

import { Zap, Brain, Code, Search, BookOpen, Rocket, TestTube2, PenTool } from "lucide-react";
import { useTaskNavigation } from "../../hooks/useTaskNavigation";
import type { AgentDetailedStatus } from "../../lib/constants";
import type { Agent } from "@/lib/types";

interface CurrentWorkSectionProps {
  agent: Agent;
}

const DETAILED_STATUS_ICONS: Record<string, any> = {
  thinking: Brain,
  coding: Code,
  reviewing: Search,
  researching: BookOpen,
  deploying: Rocket,
  testing: TestTube2,
  writing: PenTool,
};

export function CurrentWorkSection({ agent }: CurrentWorkSectionProps) {
  const openTask = useTaskNavigation();
  const isWorking = agent.currentTask && agent.currentTaskId;
  const detailedStatus = agent.detailedStatus as AgentDetailedStatus | undefined;
  const DetailedIcon = detailedStatus ? DETAILED_STATUS_ICONS[detailedStatus] || Zap : Zap;

  if (!isWorking) return null;

  return (
    <div
      className="flex items-center gap-3 text-sm bg-warning-muted border border-warning/30 text-warning rounded-xl px-4 py-3 cursor-pointer hover:bg-warning-muted transition"
      onClick={() => openTask(agent.currentTaskId!)}
    >
      <div className="w-7 h-7 rounded-lg bg-warning/20 flex items-center justify-center flex-shrink-0">
        <DetailedIcon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-warning font-medium">Currently working on</p>
        <p className="font-medium truncate">{agent.statusMessage || agent.currentTask}</p>
      </div>
    </div>
  );
}
