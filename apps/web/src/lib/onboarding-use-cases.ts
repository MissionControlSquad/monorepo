export interface OnboardingUseCase {
  id: string;
  emoji: string;
  title: string;
  subtitle: string;
  templateIds: string[];
}

/**
 * Pre-configured use-case teams for the onboarding wizard.
 * Every team starts with `squad-lead` as the orchestrator.
 * The "custom" entry redirects to the existing single-agent wizard.
 */
export const USE_CASES: OnboardingUseCase[] = [
  {
    id: "solo-founder",
    emoji: "🚀",
    title: "Solo Founder / Startup",
    subtitle: "A lean team covering research, content, code, and outreach",
    templateIds: ["squad-lead", "researcher", "content-writer", "frontend-dev", "sdr-sales"],
  },
  {
    id: "marketing-agency",
    emoji: "📣",
    title: "Marketing Agency",
    subtitle: "Content, SEO, social media, and ad copy specialists",
    templateIds: [
      "squad-lead",
      "content-writer",
      "seo-strategist",
      "social-media",
      "ad-copywriter",
    ],
  },
  {
    id: "dev-team",
    emoji: "💻",
    title: "Development Team",
    subtitle: "Full-stack engineering with DevOps and QA",
    templateIds: ["squad-lead", "frontend-dev", "backend-dev", "devops", "qa-testing"],
  },
  {
    id: "sales-growth",
    emoji: "📈",
    title: "Sales & Growth",
    subtitle: "Outbound prospecting, deal strategy, and pipeline analytics",
    templateIds: [
      "squad-lead",
      "sdr-sales",
      "outbound-strategist",
      "deal-strategist",
      "pipeline-analyst",
    ],
  },
  {
    id: "research-academic",
    emoji: "🔬",
    title: "Research & Academic",
    subtitle: "Deep research, data analysis, and technical writing",
    templateIds: ["squad-lead", "researcher", "data-analyst", "content-writer", "technical-writer"],
  },
  {
    id: "custom",
    emoji: "🛠️",
    title: "Custom",
    subtitle: "Start from scratch and pick your own agents",
    templateIds: [],
  },
];
