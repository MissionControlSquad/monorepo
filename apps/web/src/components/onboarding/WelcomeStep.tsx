"use client";

import Image from "next/image";
import { ArrowRight, Users, Zap, BarChart3 } from "lucide-react";
import { Button } from "../ui";

interface WelcomeStepProps {
  onNext: () => void;
}

const HIGHLIGHTS = [
  {
    icon: Users,
    title: "Specialized agents",
    desc: "Each agent has a role, personality, and deep skill set",
  },
  {
    icon: Zap,
    title: "Autonomous operation",
    desc: "Agents wake on schedule, do work, and report back",
  },
  {
    icon: BarChart3,
    title: "Full visibility",
    desc: "Track tasks, review deliverables, and manage from one dashboard",
  },
];

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="min-h-dvh bg-muted flex flex-col items-center justify-center px-4 py-8 sm:py-12 overflow-y-auto">
      <div className="max-w-4xl w-full">
        {/* Hero */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-brand to-brand-hover shadow-lg shadow-primary/25 mb-5 sm:mb-6">
            <Image
              src="/logo.png"
              alt="AgentCenter"
              width={36}
              height={36}
              className="rounded-lg"
            />
          </div>

          <p className="text-xs sm:text-sm font-medium text-primary tracking-wide uppercase mb-2">
            Welcome to AgentCenter
          </p>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-3 sm:mb-4 leading-tight">
            Build your AI team
            <br />
            <span className="text-primary">in 2 minutes</span>
          </h1>

          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-md mx-auto mb-6 sm:mb-8">
            Pick a use case, preview your squad, and deploy a team of specialized AI agents — all in
            one go.
          </p>

          <Button size="lg" iconRight={<ArrowRight />} onClick={onNext} className="px-8 sm:px-10">
            Get Started
          </Button>
        </div>

        {/* Highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {HIGHLIGHTS.map((h) => (
            <div
              key={h.title}
              className="flex sm:flex-col items-center sm:text-center gap-3 sm:gap-0 p-3 sm:p-4 rounded-xl border border-border bg-background"
            >
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-muted flex items-center justify-center shrink-0 sm:mb-2.5">
                <h.icon className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-0.5">{h.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{h.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
