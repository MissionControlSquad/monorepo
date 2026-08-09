"use client";

import { ArrowLeft, ArrowRight, Cloud, TerminalSquare, Check, Sparkles } from "lucide-react";
import { INSTALL_MODES, type InstallMode } from "@/lib/onboarding-local";

interface InstallModeStepProps {
  onSelect: (mode: InstallMode) => void;
  onBack: () => void;
}

const ICONS: Record<InstallMode, typeof Cloud> = {
  cloud: Cloud,
  local: TerminalSquare,
};

/**
 * Install-mode selector - the fork between the hosted "cloud" onboarding and the
 * self-hosted "local" runner install sub-flow. Selecting a card advances the
 * wizard immediately.
 */
export function InstallModeStep({ onSelect, onBack }: InstallModeStepProps) {
  return (
    <div className="h-dvh bg-muted overflow-y-auto">
      <div className="max-w-4xl w-full mx-auto px-4 py-4 sm:py-6 min-h-full">
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
            <Sparkles className="w-3 h-3 text-primary" />
            Choose install
          </div>
        </div>

        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h2 className="text-lg sm:text-xl font-bold text-foreground mb-1">
            How do you want to run your agents?
          </h2>
          <p className="text-muted-foreground text-xs sm:text-sm">
            Pick where your agents execute. You can add the other option later - this only decides
            how we set you up now.
          </p>
        </div>

        {/* Mode cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {INSTALL_MODES.map((mode) => {
            const Icon = ICONS[mode.id];
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => onSelect(mode.id)}
                className="group relative flex flex-col text-left p-5 rounded-2xl border border-border bg-background hover:border-primary hover:shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {mode.recommended && (
                  <span className="absolute top-4 right-4 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                    Recommended
                  </span>
                )}
                <div className="w-11 h-11 rounded-xl bg-muted flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-base font-semibold text-foreground">{mode.title}</h3>
                  <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {mode.tagline}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                  {mode.description}
                </p>
                <ul className="space-y-1.5 mb-5">
                  {mode.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2 text-xs text-foreground">
                      <Check className="w-3.5 h-3.5 text-success flex-shrink-0 mt-px" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                  {mode.id === "cloud" ? "Continue in the cloud" : "Set up local install"}
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
