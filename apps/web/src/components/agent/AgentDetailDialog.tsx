"use client";

import { useQuery } from "urql";
import { AGENT_QUERY } from "../../lib/graphql/queries";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/shadcn/dialog";
import {
  X,
  User,
  Settings,
  Activity,
  ExternalLink,
  Clock,
  History,
  Pencil,
  Save,
  PowerOff,
  Power,
} from "lucide-react";
import { useState, useCallback, useMemo } from "react";
import { useMutation } from "urql";
import { toast } from "sonner";
import { UPDATE_AGENT_PROFILE, SET_AGENT_ACTIVATION } from "../../lib/graphql/mutations/agents";
import { AgentStatusBadge, StatusDot } from "./AgentStatusBadge";
import { StatusHistoryTimeline } from "./StatusHistoryTimeline";
import { useAgentStatus } from "../context/AgentStatusContext";
import type { AgentDetailedStatus } from "../../lib/constants";
import { Roles, SetupStatus, AgentStatus } from "@/server/constants";
import { MentionTextArea } from "../common/MentionTextArea";
import { useMentionData, useMentionSuggestions } from "../context/MentionDataContext";
import { CopyButton } from "../common/CopyButton";
import { ProfileAvatar } from "../ui/ProfileAvatar";
import { Button, ConfirmDialog } from "../ui";
import { Input as ShadcnInput } from "@/components/ui/shadcn/input";
import type { Agent } from "@agentcenter/types";

interface AgentDetailDialogProps {
  agentId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onTaskClick?: (taskId: string) => void;
}

function DetailRow({
  label,
  value,
  copyable = false,
}: {
  label: string;
  value: string | undefined;
  copyable?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between py-2">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <div className="flex items-center">
        <span className="text-sm text-foreground text-right max-w-[260px] truncate">{value}</span>
        {copyable && <CopyButton text={value} />}
      </div>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-3 pt-4 first:pt-0">
      <div className="flex items-center space-x-2">
        {icon}
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {action}
    </div>
  );
}

function AgentDetailContent({
  agentId,
  onClose,
  onTaskClick,
}: {
  agentId: string;
  onClose: () => void;
  onTaskClick?: (taskId: string) => void;
}) {
  const [result] = useQuery({ query: AGENT_QUERY, variables: { id: agentId } });
  const agent = result.data?.agent as Agent;
  const { getOnlineInfo } = useAgentStatus();
  const { isOnline, lastSeenFormatted } = getOnlineInfo(agentId);

  // Identity editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editEmoji, setEditEmoji] = useState("");
  const [editPersonality, setEditPersonality] = useState("");
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [, updateProfile] = useMutation(UPDATE_AGENT_PROFILE);
  const [, executeSetActivation] = useMutation(SET_AGENT_ACTIVATION);
  const { agents } = useAgentStatus();
  const mentionSuggestionSources = useMentionSuggestions();
  const { profileById, agentById, taskById, projectById } = useMentionData();
  const mentionMaps = useMemo(
    () => ({ profileById, agentById, taskById, projectById }),
    [profileById, agentById, taskById, projectById],
  );
  const isDeactivated = agent?.setupStatus === SetupStatus.DEACTIVATED;
  const isLastLead =
    agent?.role === Roles.SQUAD_LEAD &&
    !isDeactivated &&
    (agents?.filter(
      (a: Agent) => a.role === Roles.SQUAD_LEAD && a.setupStatus !== SetupStatus.DEACTIVATED,
    ).length ?? 0) <= 1;

  const startEditing = useCallback(() => {
    setEditName(agent?.name ?? "");
    setEditRole(agent?.role ?? "");
    setEditEmoji(agent?.identityEmoji ?? "");
    setEditPersonality(agent?.personality ?? "");
    setIsEditing(true);
  }, [agent]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
  }, []);

  const saveEditing = useCallback(async () => {
    const result = await updateProfile({
      id: agentId,
      name: editName || undefined,
      role: editRole || undefined,
      personality: editPersonality || null,
      identityEmoji: editEmoji || null,
    });
    if (result.error) {
      toast.error("Failed to save agent profile");
      return;
    }
    toast.success("Agent profile updated");
    setIsEditing(false);
  }, [agentId, editName, editRole, editPersonality, editEmoji, updateProfile]);

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-border">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <ProfileAvatar agentId={agentId!} size="xl" />
            <StatusDot
              status={agent?.status || AgentStatus.IDLE}
              detailedStatus={agent?.detailedStatus as AgentDetailedStatus | undefined}
              isOnline={isOnline}
              className="absolute -bottom-0.5 -right-0.5 ring-2 ring-white"
            />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <DialogTitle className="text-xl font-bold text-foreground">{agent?.name}</DialogTitle>
              {agent?.status && (
                <AgentStatusBadge
                  status={agent.status}
                  detailedStatus={agent.detailedStatus as AgentDetailedStatus | undefined}
                  isOnline={isOnline}
                />
              )}
            </div>
            <p className="text-sm text-muted-foreground">{agent?.role}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="w-6 h-6" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4 divide-y divide-border">
        {/* Identity Section */}
        <div className="pb-4">
          <SectionHeader
            icon={<User className="w-4 h-4 text-indigo-500" />}
            title="Identity"
            action={
              !isEditing ? (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={startEditing}
                  className="text-indigo-600 hover:text-white bg-indigo-50 hover:bg-indigo-600"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </Button>
              ) : undefined
            }
          />
          {isEditing ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Name
                </label>
                <ShadcnInput
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1 w-full"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Role
                </label>
                <ShadcnInput
                  type="text"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="mt-1 w-full"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Emoji
                </label>
                <ShadcnInput
                  type="text"
                  value={editEmoji}
                  onChange={(e) => setEditEmoji(e.target.value)}
                  className="mt-1 w-full"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Instructions / Personality
                </label>
                <MentionTextArea
                  value={editPersonality}
                  onChange={setEditPersonality}
                  rows={6}
                  placeholder="Agent personality, instructions, and behavioral guidelines... (@ to mention)"
                  className="mt-1 w-full px-3 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-y"
                  suggestionSources={mentionSuggestionSources}
                  mentionMaps={mentionMaps}
                />
              </div>
              <div className="flex items-center justify-end space-x-2 pt-1">
                <Button variant="secondary" size="xs" onClick={cancelEditing}>
                  Cancel
                </Button>
                <Button variant="primary" size="xs" onClick={saveEditing}>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save</span>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-0.5">
              <DetailRow label="Name" value={agent?.name} />
              <DetailRow label="Role" value={agent?.role} />
              <DetailRow label="Personality" value={agent?.personality ?? undefined} />
              {agent?.identityEmoji && <DetailRow label="Emoji" value={agent.identityEmoji} />}
            </div>
          )}
        </div>

        {/* Configuration Section */}
        <div className="pb-4">
          <SectionHeader
            icon={<Settings className="w-4 h-4 text-muted-foreground" />}
            title="Configuration"
          />
          <div className="space-y-0.5">
            {agent?.apiKeyPrefix && (
              <DetailRow label="API Key" value={`${agent.apiKeyPrefix}...`} />
            )}
            <DetailRow label="Workspace" value={agent?.workspacePath ?? undefined} copyable />
            <DetailRow label="Agent ID" value={agent?.id} copyable />
            {agent?.setupStatus && (
              <div className="flex items-start justify-between py-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Status
                </span>
                <span
                  className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                    agent.setupStatus === SetupStatus.ACTIVE
                      ? "text-success bg-success/15"
                      : agent.setupStatus === SetupStatus.PENDING_SETUP
                        ? "text-warning bg-warning/15"
                        : "text-muted-foreground bg-muted"
                  }`}
                >
                  {agent.setupStatus === SetupStatus.PENDING_SETUP
                    ? "Pending Setup"
                    : agent.setupStatus === SetupStatus.ACTIVE
                      ? "Active"
                      : "Deactivated"}
                </span>
              </div>
            )}
            {agent?.setupStatus !== SetupStatus.PENDING_SETUP && (
              <div className="pt-2">
                {isDeactivated ? (
                  <Button
                    variant="success"
                    size="xs"
                    onClick={() => executeSetActivation({ id: agentId, deactivated: false })}
                    className="w-full justify-center"
                  >
                    <Power className="w-3.5 h-3.5" />
                    Reactivate Agent
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setShowDeactivateConfirm(true)}
                      disabled={isLastLead}
                      className={`w-full justify-center ${
                        isLastLead
                          ? "text-muted-foreground bg-muted cursor-not-allowed"
                          : "text-destructive bg-destructive/15 hover:bg-destructive/25"
                      }`}
                      title={isLastLead ? "Cannot deactivate the last Squad Lead" : undefined}
                    >
                      <PowerOff className="w-3.5 h-3.5" />
                      {isLastLead ? "Last Squad Lead" : "Deactivate Agent"}
                    </Button>
                    <ConfirmDialog
                      isOpen={showDeactivateConfirm}
                      onClose={() => setShowDeactivateConfirm(false)}
                      onConfirm={() => {
                        executeSetActivation({ id: agentId, deactivated: true });
                        setShowDeactivateConfirm(false);
                      }}
                      title="Deactivate agent?"
                      description="The agent will stop receiving tasks. You can reactivate it at any time."
                      confirmLabel="Deactivate"
                      variant="danger"
                    />
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Status Section */}
        <div className="pb-4">
          <SectionHeader icon={<Activity className="w-4 h-4 text-success" />} title="Status" />
          <div className="space-y-0.5">
            <div className="flex items-start justify-between py-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Status
              </span>
              <AgentStatusBadge
                status={agent?.status || AgentStatus.IDLE}
                detailedStatus={agent?.detailedStatus as AgentDetailedStatus | undefined}
                isOnline={isOnline}
                size="md"
              />
            </div>
            {agent?.statusMessage && <DetailRow label="Activity" value={agent.statusMessage} />}
            <div className="flex items-start justify-between py-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Last Heartbeat
              </span>
              <div className="flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-sm text-foreground">{lastSeenFormatted}</span>
              </div>
            </div>
            {agent?.currentTask &&
              (agent?.currentTaskId && onTaskClick ? (
                <div
                  className="flex items-start justify-between py-2 cursor-pointer hover:bg-muted rounded -mx-1 px-1 transition"
                  onClick={() => {
                    onTaskClick(agent.currentTaskId!);
                    onClose();
                  }}
                >
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Current Task
                  </span>
                  <span className="text-sm text-blue-600 hover:text-blue-700 text-right max-w-[260px] truncate">
                    {agent.currentTask}
                  </span>
                </div>
              ) : (
                <DetailRow label="Current Task" value={agent.currentTask} />
              ))}
          </div>
        </div>

        {/* Status History Section */}
        <div className="pb-4">
          <SectionHeader
            icon={<History className="w-4 h-4 text-blue-500" />}
            title="Status History"
          />
          <StatusHistoryTimeline agentId={agentId} limit={20} />
        </div>

        {/* OpenClaw Section */}
        <div className="pb-2">
          <SectionHeader
            icon={<ExternalLink className="w-4 h-4 text-purple-500" />}
            title="OpenClaw Gateway"
          />
          <p className="text-xs text-muted-foreground">
            Full agent config, cron jobs, and gateway details are available in the OpenClaw Gateway
            (run <code className="px-1 py-0.5 bg-muted rounded text-xs">openclaw gateway</code>{" "}
            locally to access).
          </p>
        </div>
      </div>
    </>
  );
}

export function AgentDetailDialog({
  agentId,
  isOpen,
  onClose,
  onTaskClick,
}: AgentDetailDialogProps) {
  if (!isOpen || !agentId) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-lg p-0 gap-0 max-h-[85vh] flex flex-col"
        showCloseButton={false}
      >
        <AgentDetailContent agentId={agentId} onClose={onClose} onTaskClick={onTaskClick} />
      </DialogContent>
    </Dialog>
  );
}
