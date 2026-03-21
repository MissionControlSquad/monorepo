"use client";

import { useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "../ui";
import { TeamAgentCard } from "./TeamAgentCard";
import { AddAgentDialog } from "./AddAgentDialog";
import type { WizardTemplate } from "@/lib/agent-wizard-templates";

export interface TeamAgent {
  templateId: string;
  name: string;
  role: string;
  emoji: string;
  description: string;
  personality: string;
  level: string;
  capabilities: string[];
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

  const handleRemove = (index: number) => {
    onUpdateTeam(team.filter((_, i) => i !== index));
  };

  const handleNameChange = (index: number, newName: string) => {
    const updated = [...team];
    updated[index] = { ...updated[index], name: newName };
    onUpdateTeam(updated);
  };

  const handleAddTemplate = (template: WizardTemplate) => {
    const newAgent: TeamAgent = {
      templateId: template.id,
      name: template.name,
      role: template.role,
      emoji: template.emoji,
      description: template.description,
      personality: template.personality,
      level: template.level,
      capabilities: template.capabilities,
    };
    onUpdateTeam([...team, newAgent]);
  };

  const atLimit = licenseLimit !== null && team.length >= licenseLimit;
  const overLimit = licenseLimit !== null && team.length > licenseLimit;

  return (
    <div className="min-h-[100dvh] bg-neutral-950 flex flex-col">
      {/* Header */}
      <div className="shrink-0 px-4 pt-6 sm:pt-8 pb-4">
        <div className="max-w-3xl w-full mx-auto">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-300 mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-neutral-100 mb-1">Your AI Team</h2>
              <p className="text-neutral-400 text-sm">
                Review, customize names, and add or remove agents before creating
              </p>
            </div>
            {!atLimit && (
              <button
                onClick={() => setDialogOpen(true)}
                className="shrink-0 h-9 px-3 rounded-lg border border-dashed border-neutral-700 hover:border-neutral-500 text-neutral-500 hover:text-neutral-300 transition-colors flex items-center gap-1.5 text-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Add Agent</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable agent cards */}
      <div className="flex-1 overflow-y-auto px-4 -webkit-overflow-scrolling-touch">
        <div className="max-w-3xl w-full mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-4">
            {team.map((agent, i) => (
              <TeamAgentCard
                key={`${agent.templateId}-${i}`}
                emoji={agent.emoji}
                name={agent.name}
                role={agent.role}
                description={agent.description}
                isSquadLead={agent.templateId === "squad-lead"}
                onRemove={agent.templateId === "squad-lead" ? undefined : () => handleRemove(i)}
                onNameChange={(name) => handleNameChange(i, name)}
              />
            ))}
          </div>

          {/* Full-width add button at bottom of list */}
          {!atLimit && (
            <button
              onClick={() => setDialogOpen(true)}
              className="w-full p-4 mb-4 rounded-xl border border-dashed border-neutral-700 hover:border-neutral-500 text-neutral-500 hover:text-neutral-300 transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <Plus className="w-4 h-4" />
              Add Agent
            </button>
          )}
        </div>
      </div>

      {/* Sticky footer */}
      <div className="shrink-0 border-t border-neutral-800 px-4 py-3 sm:py-4 bg-neutral-950">
        <div className="max-w-3xl w-full mx-auto flex items-center justify-between gap-4">
          <span className="text-sm text-neutral-500">
            {team.length} agent{team.length !== 1 ? "s" : ""}
            {licenseLimit !== null && ` / ${licenseLimit} limit`}
          </span>
          <Button
            size="lg"
            onClick={onCreate}
            disabled={team.length === 0 || overLimit}
            className="px-6 sm:px-8"
          >
            Create Team
          </Button>
        </div>
        {overLimit && (
          <div className="max-w-3xl w-full mx-auto">
            <p className="mt-2 text-sm text-red-400 text-right">
              Team exceeds your license limit of {licenseLimit} agents. Remove some agents to
              continue.
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
    </div>
  );
}
