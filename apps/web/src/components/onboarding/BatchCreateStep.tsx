"use client";

import { useEffect, useRef } from "react";
import { Check, Loader2, RefreshCw, ArrowLeft } from "lucide-react";
import { Button } from "../ui";
import type { TeamAgent } from "./TeamPreviewStep";

interface BatchCreateStepProps {
  team: TeamAgent[];
  createdCount: number;
  error: string | null;
  onRetry?: () => void;
  onBack?: () => void;
}

export function BatchCreateStep({
  team,
  createdCount,
  error,
  onRetry,
  onBack,
}: BatchCreateStepProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const progress = team.length > 0 ? Math.round((createdCount / team.length) * 100) : 0;

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [createdCount]);

  return (
    <div className="h-dvh bg-muted overflow-y-auto flex flex-col items-center justify-center px-4 py-8 sm:py-12">
      <div className="max-w-lg w-full">
        <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-1.5 text-center">
          {error ? "Something went wrong" : "Creating your team..."}
        </h2>
        <p className="text-sm text-muted-foreground text-center mb-5">
          {error
            ? `${createdCount} of ${team.length} agents created before the error`
            : `Setting up ${team.length} agents with API keys and configs`}
        </p>

        {/* Progress bar */}
        {!error && (
          <div className="mb-5">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>
                {createdCount} of {team.length}
              </span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <div ref={listRef} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {team.map((agent, i) => {
            const isDone = i < createdCount;
            const isActive = i === createdCount && !error;
            const isFailed = i === createdCount && !!error;

            return (
              <div
                key={`${agent.templateId}-${i}`}
                className={`flex items-center gap-2.5 p-2.5 rounded-lg border transition-all ${
                  isDone
                    ? "border-success/30 bg-success-muted"
                    : isActive
                      ? "border-primary/30 bg-brand-muted"
                      : isFailed
                        ? "border-destructive/30 bg-destructive-muted"
                        : "border-border bg-background"
                }`}
              >
                <span className="text-base shrink-0">{agent.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{agent.name}</p>
                  <p className="text-[11px] text-muted-foreground">{agent.role}</p>
                </div>
                <div className="shrink-0">
                  {isDone && <Check className="w-4 h-4 text-success" />}
                  {isActive && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
                </div>
              </div>
            );
          })}
        </div>

        {error && (
          <div className="mt-5">
            <div className="p-3 rounded-lg border border-destructive/30 bg-destructive-muted mb-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
            <div className="flex items-center gap-2">
              {onBack && (
                <Button
                  variant="secondary"
                  onClick={onBack}
                  icon={<ArrowLeft />}
                  className="flex-1"
                >
                  Back to Team
                </Button>
              )}
              {onRetry && (
                <Button onClick={onRetry} icon={<RefreshCw />} className="flex-1">
                  Try Again
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
