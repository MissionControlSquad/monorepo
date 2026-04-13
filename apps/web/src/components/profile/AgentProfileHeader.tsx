"use client";

import { ArrowLeft, WifiOff, Settings, Wrench, PowerOff, Power, Pencil } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "urql";
import { SET_AGENT_ACTIVATION } from "../../lib/graphql/mutations/agents";
import { AgentStatusBadge, StatusDot } from "../agent/AgentStatusBadge";
import { ProfileAvatar } from "../ui/ProfileAvatar";
import { useAgentDetail } from "../context/AgentDetailContext";
import { useAgentStatus } from "../context/AgentStatusContext";
import { AGENT_LEVELS } from "../../lib/constants";
import type { AgentDetailedStatus, AgentLevelId } from "../../lib/constants";
import { Roles, SetupStatus, type AgentStatusValue } from "@/server/constants";
import { Button } from "../ui";
import type { Agent } from "@agentcenter/types";

interface AgentProfileHeaderProps {
  agent: Agent;
}

export function AgentProfileHeader({ agent }: AgentProfileHeaderProps) {
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const router = useRouter();
  const { openAgent } = useAgentDetail();
  const [, executeSetActivation] = useMutation(SET_AGENT_ACTIVATION);
  const isDeactivated = agent.setupStatus === SetupStatus.DEACTIVATED;
  const { getOnlineInfo, agents } = useAgentStatus();
  const isLastLead =
    agent.role === Roles.SQUAD_LEAD &&
    !isDeactivated &&
    (agents?.filter(
      (a: Agent) => a.role === Roles.SQUAD_LEAD && a.setupStatus !== SetupStatus.DEACTIVATED,
    ).length ?? 0) <= 1;
  const { isOnline, lastSeenFormatted } = getOnlineInfo(agent._id ?? agent.id);
  const detailedStatus = agent.detailedStatus as AgentDetailedStatus | undefined;
  const level = agent.level as AgentLevelId | undefined;
  const levelConfig = level ? AGENT_LEVELS[level] : undefined;

  return (
    <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl shadow-sm px-3 py-3 @xl:px-5 @xl:py-4 text-white">
      {/* Hero: back + avatar + identity */}
      <div className="flex items-start gap-3 @xl:gap-4">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => router.back()}
          className="text-white/70 hover:text-white hover:bg-white/10 flex-shrink-0 mt-1"
          aria-label="Go back"
        >
          <ArrowLeft className="w-4 h-4 @xl:w-5 @xl:h-5" />
        </Button>

        <div className="relative flex-shrink-0">
          <ProfileAvatar
            agentId={agent.id}
            size="lg"
            className="w-14 h-14 @xl:w-16 @xl:h-16 ring-2 ring-white/30"
          />
          <StatusDot
            status={agent.status as AgentStatusValue}
            detailedStatus={detailedStatus}
            isOnline={isOnline}
            className="absolute -bottom-0.5 -right-0.5 ring-2 ring-white"
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 @xl:gap-2 flex-wrap">
            <h2 className="text-lg @xl:text-2xl font-bold truncate">{agent.name}</h2>
            <AgentStatusBadge
              status={agent.status as AgentStatusValue}
              detailedStatus={detailedStatus}
              isOnline={isOnline}
              size="sm"
            />
            {levelConfig && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-white/20 text-white/90">
                {levelConfig.label}
              </span>
            )}
          </div>
          <p className="text-sm @xl:text-base text-white/70 mt-0.5">{agent.role}</p>
          {agent.personality && (
            <p className="text-xs @xl:text-sm text-white/50 mt-1 line-clamp-2 italic">
              {agent.personality}
            </p>
          )}
          {!isOnline && (
            <div className="flex items-center gap-1 mt-1 text-xs text-white/50">
              <WifiOff className="w-3 h-3" />
              <span>Offline - {lastSeenFormatted}</span>
            </div>
          )}
          {agent.statusMessage && isOnline && (
            <p className="text-xs text-white/60 mt-1 truncate">{agent.statusMessage}</p>
          )}
        </div>
      </div>

      {/* Action toolbar */}
      <div className="flex items-center gap-2 justify-end border-t border-white/10 mt-3 pt-3">
        {isDeactivated ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => executeSetActivation({ id: agent.id, deactivated: false })}
            className="text-green-300 hover:text-green-100 hover:bg-white/10 flex-shrink-0"
            aria-label="Reactivate agent"
            title="Reactivate agent"
          >
            <Power className="w-4 h-4" />
            Reactivate
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDeactivateConfirm(true)}
            disabled={isLastLead}
            className={`flex-shrink-0 ${
              isLastLead
                ? "text-white/30 cursor-not-allowed"
                : "text-white/70 hover:text-destructive hover:bg-white/10"
            }`}
            aria-label="Deactivate agent"
            title={isLastLead ? "Cannot deactivate the last Squad Lead" : "Deactivate agent"}
          >
            <PowerOff className="w-4 h-4" />
            Deactivate
          </Button>
        )}

        <Link
          href={`/agent/${agent.id}/edit`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition flex-shrink-0 text-xs @xl:text-sm font-medium"
          aria-label="Edit agent profile"
        >
          <Pencil className="w-4 h-4" />
          Edit
        </Link>

        <Link
          href={`/agents/${agent.id}/setup`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition flex-shrink-0 text-xs @xl:text-sm font-medium"
          aria-label="Agent configuration"
        >
          <Wrench className="w-4 h-4" />
          Configure
        </Link>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => openAgent(agent.id)}
          className="text-white/70 hover:text-white hover:bg-white/10 flex-shrink-0"
          aria-label="Agent settings"
        >
          <Settings className="w-4 h-4" />
          Settings
        </Button>
      </div>

      {/* Deactivate confirmation dialog */}
      {showDeactivateConfirm && (
        <div className="mt-3 bg-destructive/20 border border-destructive/30 rounded-lg p-3">
          <p className="text-sm text-white/90 mb-2">
            Deactivate <strong>{agent.name}</strong>? They will stop running and disappear from the
            sidebar.
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="xs"
              variant="danger"
              onClick={() => {
                executeSetActivation({ id: agent.id, deactivated: true });
                setShowDeactivateConfirm(false);
              }}
            >
              Deactivate
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setShowDeactivateConfirm(false)}
              className="text-white/70 hover:text-white bg-white/10 hover:bg-white/20"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
