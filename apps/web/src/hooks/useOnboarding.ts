"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Agent } from "@agentcenter/types";
import { fetchOnboardingStatus } from "@agentcenter/utils";

interface OnboardingState {
  /** True while agents or onboarding status are still loading */
  loading: boolean;
  /** True when the user needs to be redirected to /onboarding */
  needsOnboarding: boolean;
}

/**
 * Checks whether the user has completed onboarding and redirects if not.
 * Agents being present counts as "onboarded" regardless of the DB flag.
 */
export function useOnboarding(agents: Agent[] | undefined): OnboardingState {
  const router = useRouter();
  const pathname = usePathname();

  const [onboardingDone, setOnboardingDone] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    fetchOnboardingStatus("")
      .then((d) => setOnboardingDone(d.completed ?? false))
      .catch(() => setOnboardingDone(true)); // fail-open so the app isn't permanently locked
  }, []);

  const hasAgents = agents !== undefined && agents.length > 0;
  const isOnboardingOrAgentRoute =
    pathname === "/onboarding" || pathname === "/agents" || pathname?.startsWith("/agents/");
  const needsOnboarding =
    onboardingDone !== undefined && !onboardingDone && !hasAgents && !isOnboardingOrAgentRoute;

  useEffect(() => {
    if (needsOnboarding) {
      router.push("/onboarding");
    }
  }, [needsOnboarding, router]);

  const loading = agents === undefined || onboardingDone === undefined;

  return { loading, needsOnboarding };
}
