"use client";

import { ArrowLeft } from "lucide-react";
import { USE_CASES, type OnboardingUseCase } from "@/lib/onboarding-use-cases";

interface UseCaseStepProps {
  onSelect: (useCase: OnboardingUseCase) => void;
  onBack: () => void;
}

export function UseCaseStep({ onSelect, onBack }: UseCaseStepProps) {
  return (
    <div className="min-h-[100dvh] bg-neutral-950 overflow-y-auto">
      <div className="max-w-3xl w-full mx-auto px-4 py-8 sm:py-16">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-300 mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <h2 className="text-2xl font-bold text-neutral-100 mb-2">Pick a use case</h2>
        <p className="text-neutral-400 mb-8">
          We&apos;ll pre-configure a team of agents tailored to your workflow
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-8">
          {USE_CASES.map((uc) => (
            <button
              key={uc.id}
              onClick={() => onSelect(uc)}
              className="text-left p-5 rounded-xl border border-neutral-800 hover:border-indigo-500/50 hover:bg-neutral-900/80 transition-all group"
            >
              <span className="text-3xl block mb-3">{uc.emoji}</span>
              <h3 className="font-semibold text-neutral-100 text-sm mb-1 group-hover:text-indigo-300 transition-colors">
                {uc.title}
              </h3>
              <p className="text-xs text-neutral-500 leading-relaxed">{uc.subtitle}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
