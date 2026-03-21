"use client";

import { useEffect, useRef } from "react";
import { Check, Loader2 } from "lucide-react";
import type { TeamAgent } from "./TeamPreviewStep";

interface BatchCreateStepProps {
  team: TeamAgent[];
  createdCount: number;
  error: string | null;
}

export function BatchCreateStep({ team, createdCount, error }: BatchCreateStepProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [createdCount]);

  return (
    <div className="min-h-[100dvh] bg-neutral-950 overflow-y-auto flex flex-col items-center justify-center px-4 py-12">
      <div className="max-w-md w-full">
        <h2 className="text-2xl font-bold text-neutral-100 mb-2 text-center">
          Creating your team...
        </h2>
        <p className="text-neutral-400 text-center mb-8">
          Setting up {team.length} agents with API keys and configs
        </p>

        <div ref={listRef} className="space-y-3">
          {team.map((agent, i) => {
            const isDone = i < createdCount;
            const isActive = i === createdCount && !error;

            return (
              <div
                key={`${agent.templateId}-${i}`}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                  isDone
                    ? "border-green-800/50 bg-green-950/20"
                    : isActive
                      ? "border-indigo-500/50 bg-indigo-950/20"
                      : "border-neutral-800 bg-neutral-900/30"
                }`}
              >
                <span className="text-xl flex-shrink-0">{agent.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-100 truncate">{agent.name}</p>
                  <p className="text-xs text-neutral-500">{agent.role}</p>
                </div>
                <div className="flex-shrink-0">
                  {isDone && <Check className="w-5 h-5 text-green-400" />}
                  {isActive && <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />}
                </div>
              </div>
            );
          })}
        </div>

        {error && (
          <div className="mt-6 p-4 rounded-lg border border-red-800/50 bg-red-950/20">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
