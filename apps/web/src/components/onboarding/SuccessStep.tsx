"use client";

import { useEffect } from "react";
import { CheckCircle } from "lucide-react";

interface SuccessStepProps {
  agentCount: number;
  onComplete: () => void;
}

export function SuccessStep({ agentCount, onComplete }: SuccessStepProps) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 2000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="h-dvh bg-muted flex flex-col items-center justify-center px-4 overflow-y-auto">
      <div className="text-center animate-in fade-in zoom-in-95 duration-500">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success-muted mb-5">
          <CheckCircle className="w-8 h-8 text-success" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">You&apos;re all set!</h2>
        <p className="text-muted-foreground text-sm">
          {agentCount} agent{agentCount !== 1 ? "s" : ""} created and ready to go.
          <br />
          Taking you to your dashboard...
        </p>
      </div>
    </div>
  );
}
