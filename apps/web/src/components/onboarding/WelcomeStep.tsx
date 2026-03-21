"use client";

import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Button } from "../ui";

interface WelcomeStepProps {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="min-h-[100dvh] bg-neutral-950 flex flex-col items-center justify-center px-4 py-12 overflow-y-auto">
      <div className="max-w-lg w-full text-center">
        <Image
          src="/logo.png"
          alt="AgentCenter"
          width={72}
          height={72}
          className="mx-auto rounded-2xl mb-8"
        />
        <h1 className="text-3xl sm:text-4xl font-bold text-neutral-100 mb-4">
          Build your AI team in 2 minutes
        </h1>
        <p className="text-base sm:text-lg text-neutral-400 leading-relaxed mb-10">
          Choose a use case and we&apos;ll set up a ready-to-go squad of specialized agents
        </p>
        <Button
          size="lg"
          iconRight={<ArrowRight />}
          onClick={onNext}
          className="px-8 py-4 text-lg shadow-lg shadow-indigo-900/20"
        >
          Get Started
        </Button>
      </div>
    </div>
  );
}
