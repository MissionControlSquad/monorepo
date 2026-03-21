"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { WelcomeStep } from "./WelcomeStep";
import { UseCaseStep } from "./UseCaseStep";
import { TeamPreviewStep, type TeamAgent } from "./TeamPreviewStep";
import { BatchCreateStep } from "./BatchCreateStep";
import { TEMPLATES } from "@/lib/agent-wizard-templates";
import { USE_CASES } from "@/lib/onboarding-use-cases";
import { getAgentName } from "@/lib/agent-default-names";
import type { OnboardingUseCase } from "@/lib/onboarding-use-cases";
import { useAgentStatus } from "../context/AgentStatusContext";

type Step = "welcome" | "use-case" | "preview" | "creating";

function nameToUsername(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "");
}

function templateIdsToTeam(ids: string[]): TeamAgent[] {
  return ids
    .map((id) => {
      const t = TEMPLATES.find((t) => t.id === id);
      if (!t) return null;
      const agentName = getAgentName(t.id, t.name);
      return {
        templateId: t.id,
        name: agentName,
        username: nameToUsername(agentName),
        role: t.role,
        emoji: t.emoji,
        description: t.description,
        personality: t.personality,
        level: t.level,
        capabilities: t.capabilities,
        skills: t.skills,
      };
    })
    .filter((a): a is TeamAgent => a !== null);
}

export function OnboardingWizard() {
  const router = useRouter();
  const { refetchAgents } = useAgentStatus();
  const [step, setStep] = useState<Step>("welcome");
  const [team, setTeam] = useState<TeamAgent[]>([]);
  const [createdCount, setCreatedCount] = useState(0);
  const [createError, setCreateError] = useState<string | null>(null);
  const [licenseLimit, setLicenseLimit] = useState<number | null>(null);
  const [resolved, setResolved] = useState(false);

  const fetchLicenseLimit = useCallback(async () => {
    try {
      const res = await fetch("/api/license");
      if (res.ok) {
        const data = await res.json();
        const limit = data.maxAgents;
        setLicenseLimit(limit === -1 ? null : (limit ?? null));
      }
    } catch {
      // Non-critical
    }
  }, []);

  // Pre-fetch license limit on mount
  useEffect(() => {
    fetchLicenseLimit();
  }, [fetchLicenseLimit]);

  // On mount: fetch saved progress from the API.
  useEffect(() => {
    if (resolved) return;

    fetch("/api/onboarding")
      .then((r) => r.json())
      .then((data) => {
        if (data.completed) {
          router.push("/");
          return;
        }

        const categoryId = data.categoryId as string | null;
        if (categoryId) {
          const useCase = USE_CASES.find((uc) => uc.id === categoryId);
          if (useCase && useCase.templateIds.length > 0) {
            setTeam(templateIdsToTeam(useCase.templateIds));
            setStep("preview");
            setResolved(true);
            return;
          }
        }

        setStep("welcome");
        setResolved(true);
      })
      .catch(() => {
        setStep("welcome");
        setResolved(true);
      });
  }, [resolved, router]);

  const handleUseCaseSelect = useCallback(
    (useCase: OnboardingUseCase) => {
      // Custom: start with just the squad lead; other use cases get the full team
      const teamIds = useCase.id === "custom" ? ["squad-lead"] : useCase.templateIds;
      setTeam(templateIdsToTeam(teamIds));
      setStep("preview");

      // Persist category selection
      fetch("/api/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: useCase.id }),
      }).catch(() => {});

      if (licenseLimit === null) fetchLicenseLimit();
    },
    [router, licenseLimit, fetchLicenseLimit],
  );

  const handleBack = useCallback((to: Step) => {
    setStep(to);
    // Clear saved category when going back to welcome/use-case
    if (to === "welcome" || to === "use-case") {
      fetch("/api/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: null }),
      }).catch(() => {});
    }
  }, []);

  const handleCreate = useCallback(async () => {
    setStep("creating");
    setCreatedCount(0);
    setCreateError(null);

    const payload = team.map((a) => ({
      name: a.name,
      role: a.role,
      username: a.username,
      identityEmoji: a.emoji,
      personality: a.personality,
      level: a.level as "junior" | "specialist" | "senior" | "lead",
      templateId: a.templateId,
    }));

    try {
      const res = await fetch("/api/agents/batch-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agents: payload }),
      });

      const data = await res.json();

      if (!res.ok) {
        setCreateError(data.error || "Failed to create agents");
        return;
      }

      const batchResults = data.results as unknown[];
      for (let i = 0; i < batchResults.length; i++) {
        setCreatedCount(i + 1);
        if (i < batchResults.length - 1) {
          await new Promise((r) => setTimeout(r, 400));
        }
      }

      await fetch("/api/onboarding", { method: "POST" }).catch(() => {});
      refetchAgents();
      router.push("/");
    } catch {
      setCreateError("Network error. Please check your connection and try again.");
    }
  }, [team, refetchAgents, router]);

  if (!resolved) {
    return (
      <div className="min-h-[100dvh] bg-muted flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  switch (step) {
    case "welcome":
      return <WelcomeStep onNext={() => setStep("use-case")} />;

    case "use-case":
      return <UseCaseStep onSelect={handleUseCaseSelect} onBack={() => handleBack("welcome")} />;

    case "preview":
      return (
        <TeamPreviewStep
          team={team}
          licenseLimit={licenseLimit}
          onUpdateTeam={setTeam}
          onBack={() => handleBack("use-case")}
          onCreate={handleCreate}
        />
      );

    case "creating":
      return (
        <BatchCreateStep
          team={team}
          createdCount={createdCount}
          error={createError}
          onRetry={createError ? handleCreate : undefined}
          onBack={createError ? () => setStep("preview") : undefined}
        />
      );
  }
}
