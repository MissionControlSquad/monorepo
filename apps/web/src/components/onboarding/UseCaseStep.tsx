"use client";

import { ArrowLeft, ArrowRight, Users } from "lucide-react";
import { USE_CASES, type OnboardingUseCase } from "@/lib/onboarding-use-cases";
import { TEMPLATES } from "@/lib/agent-wizard-templates";

interface UseCaseStepProps {
  onSelect: (useCase: OnboardingUseCase) => void;
  onBack: () => void;
}

export function UseCaseStep({ onSelect, onBack }: UseCaseStepProps) {
  return (
    <div className="min-h-dvh bg-muted overflow-y-auto">
      <div className="max-w-4xl w-full mx-auto px-4 py-4 sm:py-6">
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
            Step 1 of 2
          </div>
        </div>

        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h2 className="text-lg sm:text-xl font-bold text-foreground mb-1">
            What are you building?
          </h2>
          <p className="text-muted-foreground text-xs sm:text-sm">
            Pick a use case and we&apos;ll assemble the right team. You can customize in the next
            step.
          </p>
        </div>

        {/* Use case cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 mb-4">
          {USE_CASES.filter((uc) => uc.id !== "custom").map((uc) => (
            <button
              key={uc.id}
              onClick={() => onSelect(uc)}
              className="text-left p-4 rounded-xl border border-border bg-background hover:border-primary/40 hover:shadow-sm transition-all group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xl">{uc.emoji}</span>
                    <h3 className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors">
                      {uc.title}
                    </h3>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-2">
                    {uc.subtitle}
                  </p>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
                    <div className="flex gap-0.5">
                      {uc.templateIds.map((id) => {
                        const t = TEMPLATES.find((t) => t.id === id);
                        return t ? (
                          <span key={id} className="text-xs" title={t.role}>
                            {t.emoji}
                          </span>
                        ) : null;
                      })}
                    </div>
                    <span className="ml-0.5">{uc.templateIds.length} agents</span>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground/20 group-hover:text-primary transition-colors mt-0.5 shrink-0" />
              </div>
            </button>
          ))}
        </div>

        {/* Custom option */}
        {USE_CASES.filter((uc) => uc.id === "custom").map((uc) => (
          <button
            key={uc.id}
            onClick={() => onSelect(uc)}
            className="w-full text-center py-2.5 rounded-lg border border-dashed border-border hover:border-muted-foreground/40 text-muted-foreground hover:text-foreground transition-colors text-sm"
          >
            {uc.emoji} {uc.title} — {uc.subtitle}
          </button>
        ))}
      </div>
    </div>
  );
}
