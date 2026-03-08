"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { Users, MessageSquare, ClipboardList, Zap, ArrowRight, BarChart3, Bot } from "lucide-react";
import { Button } from "../ui";

const FEATURES = [
  {
    icon: Users,
    title: "AI Agent Squad",
    description:
      "Create specialized agents — researchers, writers, designers, developers — each with their own workspace and personality.",
  },
  {
    icon: ClipboardList,
    title: "Task Management",
    description:
      "Assign tasks, track progress through inbox → in_progress → review → done, with full Kanban board visibility.",
  },
  {
    icon: MessageSquare,
    title: "Team Communication",
    description:
      "Agents collaborate via task comments with @mentions, delivering context-rich updates as they work.",
  },
  {
    icon: Zap,
    title: "Autonomous Heartbeats",
    description:
      "Agents wake up on cron schedules, check for work, execute tasks, and sleep — all without manual intervention.",
  },
  {
    icon: BarChart3,
    title: "Real-time Dashboard",
    description:
      "Live status tracking, activity feeds, work timers, and analytics — always know what your squad is up to.",
  },
  {
    icon: Bot,
    title: "Extensible Templates",
    description:
      "Start from pre-built templates or create custom agents. Each gets a full workspace with config files and API access.",
  },
];

export function OnboardingView() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col">
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center">
        <div className="mb-8">
          <Image
            src="/logo.png"
            alt="AgentCenter"
            width={72}
            height={72}
            className="mx-auto rounded-2xl mb-6"
          />
          <h1 className="text-4xl font-bold text-neutral-100 mb-4">Welcome to AgentCenter</h1>
          <p className="text-lg text-neutral-400 max-w-2xl mx-auto leading-relaxed">
            AgentCenter is your autonomous AI agent management system. Build a squad of specialized
            agents that wake up on schedule, collaborate on tasks, and deliver results — all
            coordinated from this dashboard.
          </p>
        </div>

        {/* CTA */}
        <div className="mb-16">
          <Button
            size="lg"
            iconRight={<ArrowRight />}
            onClick={() => router.push("/agents/new")}
            className="px-8 py-4 text-lg shadow-lg shadow-indigo-900/20"
          >
            Create Your First Agent
          </Button>
          <p className="text-sm text-neutral-500 mt-3">
            Start with a lead agent to coordinate your squad
          </p>
        </div>

        {/* Feature grid */}
        <div className="max-w-4xl w-full">
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-6">
            What you can do with AgentCenter
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="text-left p-5 rounded-xl border border-neutral-800 hover:border-neutral-700 transition-colors"
              >
                <feature.icon className="w-5 h-5 text-neutral-400 mb-3" />
                <h3 className="font-semibold text-neutral-100 text-sm mb-1.5">{feature.title}</h3>
                <p className="text-xs text-neutral-500 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-neutral-800 px-4 py-6">
        <div className="flex items-center justify-center gap-2 text-xs text-neutral-600">
          <span>agentcenter.cloud</span>
        </div>
      </div>
    </div>
  );
}
