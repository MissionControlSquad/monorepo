"use client";

import { useState } from "react";
import { ArrowLeft, Plus, Users } from "lucide-react";
import { Button } from "../ui";
import { TeamAgentCard } from "./TeamAgentCard";
import { AddAgentDialog } from "./AddAgentDialog";
import { AgentEditSheet } from "./AgentEditSheet";
import type { WizardTemplate } from "@/lib/agent-wizard-templates";
import { getAgentName } from "@/lib/agent-default-names";

export interface TeamAgent {
  templateId: string;
  name: string;
  username: string;
  role: string;
  emoji: string;
  description: string;
  personality: string;
  level: string;
  capabilities: string[];
  skills: string[];
}

interface TeamPreviewStepProps {
  team: TeamAgent[];
  licenseLimit: number | null;
  onUpdateTeam: (team: TeamAgent[]) => void;
  onBack: () => void;
  onCreate: () => void;
}

export function TeamPreviewStep({
  team,
  licenseLimit,
  onUpdateTeam,
  onBack,
  onCreate,
}: TeamPreviewStepProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);

  const handleRemove = (index: number) => {
    onUpdateTeam(team.filter((_, i) => i !== index));
    if (editIndex === index) setEditIndex(null);
  };

  const handleNameChange = (index: number, newName: string) => {
    const updated = [...team];
    updated[index] = { ...updated[index], name: newName };
    onUpdateTeam(updated);
  };

  const handleUsernameChange = (index: number, newUsername: string) => {
    const updated = [...team];
    updated[index] = { ...updated[index], username: newUsername };
    onUpdateTeam(updated);
  };

  const handleAddTemplate = (template: WizardTemplate) => {
    const agentName = getAgentName(template.id, template.name);
    const newAgent: TeamAgent = {
      templateId: template.id,
      name: agentName,
      username: agentName
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9_-]/g, ""),
      role: template.role,
      emoji: template.emoji,
      description: template.description,
      personality: template.personality,
      level: template.level,
      capabilities: template.capabilities,
      skills: template.skills,
    };
    onUpdateTeam([...team, newAgent]);
  };

  const atLimit = licenseLimit !== null && team.length >= licenseLimit;
  const overLimit = licenseLimit !== null && team.length > licenseLimit;
  const editingAgent = editIndex !== null ? team[editIndex] : null;

  return (
    <div className="h-dvh bg-muted flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-4 pt-4 sm:pt-6 pb-3">
        <div className="max-w-4xl w-full mx-auto">
          {/* Nav bar */}
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background border border-border text-xs text-muted-foreground">
              <Users className="w-3 h-3 text-primary" />
              Step 2 of 2
            </div>
          </div>

          {/* Heading */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-foreground mb-1">
                Your AI Team
                <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                  ({team.length})
                </span>
              </h2>
              <p className="text-muted-foreground text-xs sm:text-sm">
                Review your team, edit details, and add or remove agents
              </p>
            </div>
            {!atLimit && (
              <button
                onClick={() => setDialogOpen(true)}
                className="shrink-0 h-8 px-3 rounded-lg border border-dashed border-border hover:border-muted-foreground/40 text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 text-xs sm:text-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Add Agent</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable agent cards */}
      <div className="flex-1 overflow-y-auto px-4">
        <div className="max-w-4xl w-full mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pb-3">
            {team.map((agent, i) => (
              <TeamAgentCard
                key={`${agent.templateId}-${i}`}
                templateId={agent.templateId}
                emoji={agent.emoji}
                name={agent.name}
                username={agent.username}
                role={agent.role}
                description={agent.description}
                capabilities={agent.capabilities}
                isSquadLead={agent.templateId === "squad-lead"}
                onRemove={agent.templateId === "squad-lead" ? undefined : () => handleRemove(i)}
                onEdit={() => setEditIndex(i)}
              />
            ))}

            {/* Add agent card */}
            {!atLimit && (
              <button
                onClick={() => setDialogOpen(true)}
                className="min-h-[100px] rounded-xl border border-dashed border-border hover:border-muted-foreground/40 text-muted-foreground hover:text-foreground transition-colors flex flex-col items-center justify-center gap-1.5 text-sm"
              >
                <Plus className="w-5 h-5" />
                <span>Add Agent</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Sticky footer */}
      <div className="shrink-0 border-t border-border px-4 py-2.5 sm:py-3 bg-muted">
        <div className="max-w-4xl w-full mx-auto flex items-center justify-between gap-4">
          {licenseLimit !== null ? (
            <span className="text-xs sm:text-sm text-muted-foreground">
              {team.length} / {licenseLimit} agent limit
            </span>
          ) : (
            <span />
          )}
          <Button
            onClick={onCreate}
            disabled={team.length === 0 || overLimit}
            className="px-5 sm:px-8"
          >
            Create {team.length} Agent{team.length !== 1 ? "s" : ""}
          </Button>
        </div>
        {overLimit && (
          <div className="max-w-4xl w-full mx-auto">
            <p className="mt-1.5 text-xs sm:text-sm text-destructive text-right">
              Team exceeds your license limit of {licenseLimit} agents. Remove some to continue.
            </p>
          </div>
        )}
      </div>

      <AddAgentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSelect={handleAddTemplate}
        excludeIds={team.map((a) => a.templateId)}
      />

      {/* Edit sheet */}
      {editingAgent && editIndex !== null && (
        <AgentEditSheet
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditIndex(null);
          }}
          emoji={editingAgent.emoji}
          name={editingAgent.name}
          username={editingAgent.username}
          role={editingAgent.role}
          description={editingAgent.description}
          capabilities={editingAgent.capabilities}
          skills={editingAgent.skills}
          templateId={editingAgent.templateId}
          isSquadLead={editingAgent.templateId === "squad-lead"}
          onNameChange={(name) => handleNameChange(editIndex, name)}
          onUsernameChange={(username) => handleUsernameChange(editIndex, username)}
          onRemove={
            editingAgent.templateId === "squad-lead" ? undefined : () => handleRemove(editIndex)
          }
        />
      )}
    </div>
  );
}
