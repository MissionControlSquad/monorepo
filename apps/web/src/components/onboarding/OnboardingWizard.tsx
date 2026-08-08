"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { WelcomeStep } from "./WelcomeStep";
import { InstallModeStep } from "./InstallModeStep";
import { LocalInstallStep } from "./LocalInstallStep";
import { UseCaseStep } from "./UseCaseStep";
import { TeamPreviewStep, type TeamAgent } from "./TeamPreviewStep";
import { BatchCreateStep } from "./BatchCreateStep";
import { SuccessStep } from "./SuccessStep";
import { TEMPLATES } from "@/lib/agent-wizard-templates";
import { USE_CASES } from "@/lib/onboarding-use-cases";
import { API_ROUTES } from "@/lib/api-routes";
import { getAgentName } from "@/lib/agent-default-names";
import type { OnboardingUseCase } from "@/lib/onboarding-use-cases";
import type { InstallMode } from "@/lib/onboarding-local";
import { useAgentStatus } from "../context/AgentStatusContext";
import { type AgentLevelValue } from "@/server/constants";

type Step =
  "welcome" | "install-mode" | "local-install" | "use-case" | "preview" | "creating" | "success";

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
  const [transitioning, setTransitioning] = useState(false);

  const fetchLicenseLimit = useCallback(async () => {
    try {
      const res = await fetch(API_ROUTES.license.get);
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

    fetch(API_ROUTES.onboarding.get)
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

  // Fade transition helper
  const goToStep = useCallback((next: Step) => {
    setTransitioning(true);
    setTimeout(() => {
      setStep(next);
      setTransitioning(false);
    }, 150);
  }, []);

  const handleUseCaseSelect = useCallback(
    (useCase: OnboardingUseCase) => {
      const teamIds = useCase.id === "custom" ? ["squad-lead"] : useCase.templateIds;
      setTeam(templateIdsToTeam(teamIds));
      goToStep("preview");

      fetch(API_ROUTES.onboarding.get, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: useCase.id }),
      }).catch(() => {});

      if (licenseLimit === null) fetchLicenseLimit();
    },
    [licenseLimit, fetchLicenseLimit, goToStep],
  );

  const handleBack = useCallback(
    (to: Step) => {
      goToStep(to);
      if (to === "welcome" || to === "use-case") {
        fetch(API_ROUTES.onboarding.get, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ categoryId: null }),
        }).catch(() => {});
      }
    },
    [goToStep],
  );

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
      level: a.level as AgentLevelValue,
      templateId: a.templateId,
    }));

    try {
      const res = await fetch(API_ROUTES.agents.batchCreate, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agents: payload }),
      });

      const data = await res.json();

      if (!res.ok) {
        setCreateError(data.error || "Failed to create agents");
        return;
      }

      // Varied timing for natural feel
      const batchResults = data.results as unknown[];
      for (let i = 0; i < batchResults.length; i++) {
        setCreatedCount(i + 1);
        if (i < batchResults.length - 1) {
          const delay = 200 + Math.random() * 400;
          await new Promise((r) => setTimeout(r, delay));
        }
      }

      await fetch(API_ROUTES.onboarding.get, { method: "POST" }).catch(() => {});
      refetchAgents();
      setStep("success");
    } catch {
      setCreateError("Network error. Please check your connection and try again.");
    }
  }, [team, refetchAgents]);

  const handleSuccessComplete = useCallback(() => {
    router.push("/");
  }, [router]);

  const handleInstallModeSelect = useCallback(
    (mode: InstallMode) => {
      goToStep(mode === "local" ? "local-install" : "use-case");
    },
    [goToStep],
  );

  // Local self-host path: mark onboarding done, then land on the dashboard.
  const handleLocalComplete = useCallback(async () => {
    await fetch(API_ROUTES.onboarding.get, { method: "POST" }).catch(() => {});
    router.push("/");
  }, [router]);

  if (!resolved) {
    return (
      <div className="h-dvh bg-muted flex items-center justify-center overflow-y-auto">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const content = (() => {
    switch (step) {
      case "welcome":
        return <WelcomeStep onNext={() => goToStep("install-mode")} />;

      case "install-mode":
        return (
          <InstallModeStep onSelect={handleInstallModeSelect} onBack={() => goToStep("welcome")} />
        );

      case "local-install":
        return (
          <LocalInstallStep
            onBack={() => goToStep("install-mode")}
            onComplete={handleLocalComplete}
          />
        );

      case "use-case":
        return (
          <UseCaseStep onSelect={handleUseCaseSelect} onBack={() => handleBack("install-mode")} />
        );

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

      case "success":
        return <SuccessStep agentCount={team.length} onComplete={handleSuccessComplete} />;
    }
  })();

  return (
    <div
      className={`transition-opacity duration-150 ${transitioning ? "opacity-0" : "opacity-100"}`}
    >
      {content}
    </div>
  );
}
