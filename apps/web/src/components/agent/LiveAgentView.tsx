"use client";

import { useState, useRef, useEffect, memo } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/shadcn/dialog";
import { ProfileAvatar } from "../ui/ProfileAvatar";
import {
  X,
  Eye,
  Code,
  Terminal,
  FileText,
  MessageSquare,
  Zap,
  Clock,
  Brain,
  Search,
  Rocket,
  TestTube2,
  PenTool,
  WifiOff,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { useQuery, useSubscription } from "urql";
import { AGENT_ACTIONS_BY_AGENT_QUERY } from "../../lib/graphql/queries";
import { AGENT_ACTION_LOGGED_SUBSCRIPTION } from "../../lib/graphql/subscriptions";
import { useAgentStatus } from "../context/AgentStatusContext";
import { TimeAgo } from "../common/TimeAgo";
import { AgentStatusBadge } from "./AgentStatusBadge";
import { type AgentDetailedStatus } from "../../lib/constants";
import { Button } from "@/components/ui";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import type { Agent, AgentAction } from "@agentcenter/types";

interface LiveAgentViewProps {
  agentId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onTaskClick?: (taskId: string) => void;
}

const ACTION_ICONS: Record<string, any> = {
  file_opened: FileText,
  file_edited: Code,
  command_executed: Terminal,
  code_written: Code,
  research_done: Eye,
  comment_posted: MessageSquare,
  status_update: Zap,
  thinking: Brain,
  waiting: Clock,
  reviewing: Search,
  deploying: Rocket,
  testing: TestTube2,
  writing_docs: PenTool,
};

const ACTION_COLORS: Record<string, string> = {
  file_opened: "text-blue-600 bg-blue-50",
  file_edited: "text-purple-600 bg-purple-50",
  command_executed: "text-green-600 bg-green-50",
  code_written: "text-indigo-600 bg-indigo-50",
  research_done: "text-yellow-600 bg-yellow-50",
  comment_posted: "text-pink-600 bg-pink-50",
  status_update: "text-orange-600 bg-orange-50",
  thinking: "text-purple-600 bg-purple-50",
  waiting: "text-muted-foreground bg-muted",
  reviewing: "text-indigo-600 bg-indigo-50",
  deploying: "text-orange-600 bg-orange-50",
  testing: "text-cyan-600 bg-cyan-50",
  writing_docs: "text-emerald-600 bg-emerald-50",
};

const LiveAgentViewContent = memo(function LiveAgentViewContent({
  agentId,
  onClose,
  onTaskClick,
}: {
  agentId: string;
  onClose: () => void;
  onTaskClick?: (taskId: string) => void;
}) {
  const [autoScroll, setAutoScroll] = useState(true);
  const feedRef = useRef<HTMLDivElement>(null);

  const { agents, getOnlineInfo } = useAgentStatus();
  const [result] = useQuery({
    query: AGENT_ACTIONS_BY_AGENT_QUERY,
    variables: { agentId, limit: 50 },
  });
  const actions = (result.data?.agentActionsByAgent as AgentAction[] | undefined) ?? [];

  // Subscribe to new actions — graphcache inserts into cached list automatically
  useSubscription({ query: AGENT_ACTION_LOGGED_SUBSCRIPTION, variables: { agentId } });

  // Auto-scroll to bottom when new actions arrive
  useEffect(() => {
    if (autoScroll && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [actions.length, autoScroll]);

  const paginationStatus = result.fetching ? "LoadingFirstPage" : "Exhausted";
  const sentinelRef = useRef<HTMLDivElement>(null);
  const currentAgent = agents?.find((a: Agent) => a.id === agentId);
  const { isOnline, lastSeenFormatted } = getOnlineInfo(agentId);

  if (!currentAgent) return null;

  const detailedStatus = currentAgent.detailedStatus as AgentDetailedStatus | undefined;

  return (
    <>
      {/* Header */}
      <div className="bg-linear-to-r from-indigo-500 to-purple-600 px-4 sm:px-6 py-3 sm:py-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 min-w-0">
            <ProfileAvatar
              src={currentAgent.avatar}
              name={currentAgent.name}
              emoji={currentAgent.identityEmoji}
              size="lg"
            />
            <div className="min-w-0">
              <DialogTitle className="text-lg sm:text-xl font-semibold truncate">
                {currentAgent.name} - Live View
              </DialogTitle>
              <p className="text-sm text-indigo-100 truncate">
                {currentAgent.role}
                {currentAgent.statusMessage && (
                  <span className="ml-2 opacity-80">- {currentAgent.statusMessage}</span>
                )}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close live view"
            className="text-white hover:text-indigo-100 hover:bg-background/10 shrink-0 ml-2"
          >
            <X className="w-6 h-6" />
          </Button>
        </div>

        {/* Current Status */}
        <div className="mt-3 sm:mt-4 flex items-center flex-wrap gap-2 sm:space-x-4">
          {!isOnline ? (
            <div className="flex items-center space-x-2">
              <WifiOff className="w-3.5 h-3.5 text-gray-300" />
              <span className="text-sm text-gray-200">Offline - {lastSeenFormatted}</span>
            </div>
          ) : (
            <AgentStatusBadge
              status={currentAgent.status}
              detailedStatus={detailedStatus}
              isOnline={isOnline}
              size="md"
            />
          )}
          {currentAgent.currentTask && (
            <div
              className={`flex items-center space-x-2 bg-background bg-opacity-20 rounded-full px-3 py-1 ${onTaskClick && currentAgent.currentTaskId ? "cursor-pointer hover:bg-opacity-30 transition" : ""}`}
              onClick={
                onTaskClick && currentAgent.currentTaskId
                  ? () => {
                      onTaskClick(currentAgent.currentTaskId!);
                      onClose();
                    }
                  : undefined
              }
            >
              <Zap className="w-3 h-3" />
              <span className="text-xs truncate max-w-xs">{currentAgent.currentTask}</span>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="bg-muted px-4 sm:px-6 py-2.5 sm:py-3 border-b border-border flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Live Activity Feed - {actions.length} actions
        </div>
        <div className="flex items-center space-x-2">
          <label className="flex items-center space-x-2 text-sm text-muted-foreground">
            <Checkbox
              checked={autoScroll}
              onCheckedChange={(checked) => setAutoScroll(checked === true)}
            />
            <span>Auto-scroll</span>
          </label>
        </div>
      </div>

      {/* Activity Feed */}
      <div ref={feedRef} className="h-[50vh] sm:h-[60vh] overflow-y-auto bg-foreground p-3 sm:p-6">
        {paginationStatus === "LoadingFirstPage" ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin mb-4 opacity-50" />
            <p className="text-sm">Loading actions...</p>
          </div>
        ) : actions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Eye className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg">No activity yet</p>
            <p className="text-sm">Actions will appear here in real-time</p>
          </div>
        ) : (
          <div className="space-y-3">
            {actions.map((action: AgentAction) => {
              const Icon = ACTION_ICONS[action.actionType] || Terminal;
              const colorClass =
                ACTION_COLORS[action.actionType] || "text-muted-foreground bg-muted";

              return (
                <div
                  key={action.id}
                  className="flex items-start space-x-2.5 sm:space-x-3 bg-foreground/80 rounded-lg p-3 sm:p-4 hover:bg-foreground/90 transition"
                >
                  {/* Icon */}
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <p className="text-sm font-medium text-white">{action.description}</p>
                      <TimeAgo
                        date={action.timestamp}
                        className="text-xs text-muted-foreground whitespace-nowrap ml-2"
                      />
                    </div>

                    {/* Metadata */}
                    {action.metadata &&
                      (() => {
                        const meta = action.metadata as Record<string, string | undefined>;
                        return (
                          <div className="mt-2">
                            {meta.file && (
                              <div className="text-xs text-muted-foreground font-mono bg-foreground rounded px-2 py-1 inline-block">
                                📄 {meta.file}
                              </div>
                            )}
                            {meta.command && (
                              <div className="text-xs text-green-400 font-mono bg-foreground rounded px-2 py-1 mt-1">
                                $ {meta.command}
                              </div>
                            )}
                            {meta.output && (
                              <pre className="text-xs text-gray-300 font-mono bg-foreground rounded px-2 py-1 mt-1 overflow-x-auto">
                                {meta.output}
                              </pre>
                            )}
                            {meta.code && (
                              <pre className="text-xs text-indigo-300 font-mono bg-foreground rounded px-2 py-1 mt-1 overflow-x-auto">
                                {meta.code}
                              </pre>
                            )}
                          </div>
                        );
                      })()}

                    {/* Task Info */}
                    {action.taskId && (
                      <div
                        className={`mt-2 text-xs text-blue-400 ${onTaskClick ? "cursor-pointer hover:text-blue-300 transition" : ""}`}
                        onClick={
                          onTaskClick
                            ? () => {
                                onTaskClick(action.taskId!);
                                onClose();
                              }
                            : undefined
                        }
                      >
                        ↳ Working on task
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Scroll sentinel (pagination stubbed) */}
            <div ref={sentinelRef} className="h-1" />
            {paginationStatus === "Exhausted" && actions.length > 0 && (
              <div className="flex items-center justify-center py-4 gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">All actions loaded</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="bg-muted px-4 sm:px-6 py-3 border-t border-border">
        <p className="text-xs text-muted-foreground">
          This view updates in real-time as the agent performs actions
        </p>
      </div>
    </>
  );
});

export function LiveAgentView({ agentId, isOpen, onClose, onTaskClick }: LiveAgentViewProps) {
  if (!agentId) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl sm:max-w-4xl p-0 gap-0" showCloseButton={false}>
        <LiveAgentViewContent agentId={agentId} onClose={onClose} onTaskClick={onTaskClick} />
      </DialogContent>
    </Dialog>
  );
}
