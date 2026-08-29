"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  LayoutDashboard,
  Bot,
  MessageSquare,
  FolderKanban,
  BarChart3,
  SquarePen,
  CreditCard,
  Receipt,
  KeyRound,
  Workflow,
  Repeat,
  ShieldCheck,
  Ticket,
  Puzzle,
  MailCheck,
  Users,
  Zap,
  PackageOpen,
  Target,
  Activity,
  Landmark,
  Plug,
  Terminal,
  SquareTerminal,
  FileText,
  Network,
  Inbox,
  Lock,
  Boxes,
  Search,
  Images,
  FileBox,
  FlaskConical,
  GitBranch,
  ServerCog,
  GanttChart,
  Gauge,
  Cpu,
  Wrench,
  Container,
  Gavel,
  Building2,
  ClipboardCheck,
  Server,
  Sun,
  Moon,
  Brain,
} from "lucide-react";
import { useQuery } from "urql";
import {
  SIDEBAR_BADGES_QUERY,
  SIDEBAR_PREFERENCE_QUERY,
} from "@agentcenter/graphql-client/queries";
import { useFeatureFlags } from "../../context/FeatureFlagContext";
import { useTheme } from "@/hooks/useTheme";
import { FLAG_KEYS } from "@agentcenter/utils";
import { SupportMenu } from "../../support/SupportMenu";
import { AccountMenuSlot } from "@/components/layout/AccountMenuSlot";
import { BuildbaseSettingsHost } from "@/components/providers/BuildbaseSettingsHost";

interface IconRailProps {
  onCreateTask: () => void;
}

// Top-level sections shown on the icon rail; each expands to its items in the panel.
export type NavGroup =
  | "Overview"
  | "Inbox"
  | "Agents"
  | "Work"
  | "Communication"
  | "Infrastructure"
  | "Finance & insights"
  | "Content & platform";

export const NAV_GROUPS: NavGroup[] = [
  "Overview",
  "Inbox",
  "Agents",
  "Work",
  "Communication",
  "Infrastructure",
  "Finance & insights",
  "Content & platform",
];

/** Rail icon + short label per group. */
const GROUP_META: Record<NavGroup, { icon: typeof LayoutDashboard; short: string }> = {
  Overview: { icon: LayoutDashboard, short: "Overview" },
  Inbox: { icon: Inbox, short: "Inbox" },
  Agents: { icon: Bot, short: "Agents" },
  Work: { icon: FolderKanban, short: "Work" },
  Communication: { icon: MessageSquare, short: "Comms" },
  Infrastructure: { icon: Server, short: "Infra" },
  "Finance & insights": { icon: CreditCard, short: "Finance" },
  "Content & platform": { icon: Boxes, short: "Content" },
};

export interface NavItem {
  href: string;
  icon: typeof LayoutDashboard;
  label: string;
  flag?: string;
  group: NavGroup;
}

export const NAV_ITEMS: NavItem[] = [
  // ── Overview ──
  { href: "/", icon: LayoutDashboard, label: "Home", group: "Overview" },
  { href: "/search", icon: Search, label: "Search", group: "Overview" },
  { href: "/timeline", icon: GanttChart, label: "Timeline", group: "Overview" },

  // ── Inbox ──
  {
    href: "/attention",
    icon: Inbox,
    label: "Attention",
    flag: FLAG_KEYS.ATTENTION,
    group: "Inbox",
  },
  {
    href: "/review",
    icon: ClipboardCheck,
    label: "Needs my review",
    flag: FLAG_KEYS.GOVERNANCE,
    group: "Inbox",
  },
  {
    href: "/approvals",
    icon: Gavel,
    label: "Approvals",
    flag: FLAG_KEYS.GOVERNANCE,
    group: "Inbox",
  },

  // ── Agents ──
  { href: "/agents", icon: Bot, label: "Agents", group: "Agents" },
  { href: "/skills", icon: Puzzle, label: "Skills", flag: FLAG_KEYS.SKILLS_TEAMS, group: "Agents" },
  { href: "/teams", icon: Users, label: "Teams", flag: FLAG_KEYS.SKILLS_TEAMS, group: "Agents" },
  {
    href: "/instructions",
    icon: FileText,
    label: "Instructions",
    flag: FLAG_KEYS.AGENT_INSTRUCTIONS,
    group: "Agents",
  },
  {
    href: "/adapters",
    icon: Boxes,
    label: "Adapters",
    flag: FLAG_KEYS.MULTI_PROVIDER_ADAPTERS,
    group: "Agents",
  },
  {
    href: "/adapter-plugins",
    icon: Puzzle,
    label: "Adapter plugins",
    flag: FLAG_KEYS.ADAPTER_PLUGINS,
    group: "Agents",
  },
  {
    href: "/org-chart",
    icon: Network,
    label: "Org chart",
    flag: FLAG_KEYS.ORG_CHART,
    group: "Agents",
  },
  {
    href: "/companies",
    icon: Building2,
    label: "Companies",
    flag: FLAG_KEYS.AGENT_COMPANIES,
    group: "Agents",
  },
  {
    href: "/agent-authz",
    icon: Lock,
    label: "Agent access",
    flag: FLAG_KEYS.AGENT_AUTHZ,
    group: "Agents",
  },
  {
    href: "/agent-insights",
    icon: Activity,
    label: "Agent insights",
    flag: FLAG_KEYS.PRODUCTIVITY_REVIEW,
    group: "Agents",
  },
  { href: "/memory", icon: Brain, label: "Agent memory", flag: FLAG_KEYS.MEMORY, group: "Agents" },

  // ── Work ──
  { href: "/projects", icon: FolderKanban, label: "Projects", group: "Work" },
  { href: "/goals", icon: Target, label: "Goals", flag: FLAG_KEYS.GOALS, group: "Work" },
  { href: "/cases", icon: Ticket, label: "Cases", flag: FLAG_KEYS.CASES, group: "Work" },
  {
    href: "/routines",
    icon: Repeat,
    label: "Routines",
    flag: FLAG_KEYS.PIPELINES_ROUTINES,
    group: "Work",
  },
  {
    href: "/pipelines",
    icon: Workflow,
    label: "Pipelines",
    flag: FLAG_KEYS.PIPELINES_ROUTINES,
    group: "Work",
  },
  {
    href: "/reliability",
    icon: ShieldCheck,
    label: "Reliability",
    flag: FLAG_KEYS.TASK_AUTONOMY,
    group: "Work",
  },
  { href: "/monitors", icon: Gauge, label: "Monitors", flag: FLAG_KEYS.MONITORS, group: "Work" },

  // ── Communication ──
  {
    href: "/channels",
    icon: MessageSquare,
    label: "Channels",
    flag: FLAG_KEYS.CHANNELS,
    group: "Communication",
  },
  {
    href: "/boardroom",
    icon: Landmark,
    label: "Boardroom",
    flag: FLAG_KEYS.BOARD_CHAT,
    group: "Communication",
  },
  {
    href: "/inbox-policies",
    icon: MailCheck,
    label: "Inbox policies",
    flag: FLAG_KEYS.INBOX_POLICY,
    group: "Communication",
  },

  // ── Infrastructure ──
  {
    href: "/environments",
    icon: Container,
    label: "Environments",
    flag: FLAG_KEYS.ENVIRONMENTS,
    group: "Infrastructure",
  },
  {
    href: "/runners",
    icon: Cpu,
    label: "Runners",
    flag: FLAG_KEYS.RUNNERS,
    group: "Infrastructure",
  },
  {
    href: "/ai-tools",
    icon: Wrench,
    label: "AI Tools",
    flag: FLAG_KEYS.AI_TOOLS,
    group: "Infrastructure",
  },
  {
    href: "/terminals",
    icon: SquareTerminal,
    label: "Terminals",
    flag: FLAG_KEYS.TERMINALS,
    group: "Infrastructure",
  },
  {
    href: "/local-services",
    icon: ServerCog,
    label: "Local services",
    flag: FLAG_KEYS.LOCAL_SERVICES,
    group: "Infrastructure",
  },
  {
    href: "/live-gateway",
    icon: Zap,
    label: "Live Gateway",
    flag: FLAG_KEYS.LIVE_GATEWAY,
    group: "Infrastructure",
  },
  {
    href: "/cloud-upstreams",
    icon: GitBranch,
    label: "Cloud upstreams",
    flag: FLAG_KEYS.CLOUD_UPSTREAMS,
    group: "Infrastructure",
  },
  {
    href: "/provider-auth",
    icon: KeyRound,
    label: "Provider auth",
    flag: FLAG_KEYS.PROVIDER_AUTH,
    group: "Infrastructure",
  },
  {
    href: "/smoke-lab",
    icon: FlaskConical,
    label: "Smoke lab",
    flag: FLAG_KEYS.SMOKE_LAB,
    group: "Infrastructure",
  },

  // ── Finance & insights ──
  {
    href: "/finance",
    icon: CreditCard,
    label: "Finance",
    flag: FLAG_KEYS.BUDGETS,
    group: "Finance & insights",
  },
  {
    href: "/ledger",
    icon: Receipt,
    label: "Ledger",
    flag: FLAG_KEYS.LEDGER,
    group: "Finance & insights",
  },
  {
    href: "/analytics",
    icon: BarChart3,
    label: "Analytics",
    flag: FLAG_KEYS.ANALYTICS,
    group: "Finance & insights",
  },
  {
    href: "/observability",
    icon: Activity,
    label: "Observability",
    flag: FLAG_KEYS.OBSERVABILITY,
    group: "Finance & insights",
  },

  // ── Content & platform ──
  {
    href: "/artifacts",
    icon: Images,
    label: "Artifacts",
    flag: FLAG_KEYS.ARTIFACTS,
    group: "Content & platform",
  },
  {
    href: "/assets",
    icon: FileBox,
    label: "Assets",
    flag: FLAG_KEYS.ASSETS,
    group: "Content & platform",
  },
  {
    href: "/portability",
    icon: PackageOpen,
    label: "Portability",
    flag: FLAG_KEYS.WORKSPACE_PORTABILITY,
    group: "Content & platform",
  },
  {
    href: "/secrets",
    icon: KeyRound,
    label: "Secrets",
    flag: FLAG_KEYS.SECRETS_VAULT,
    group: "Content & platform",
  },
  {
    href: "/plugins",
    icon: Plug,
    label: "Plugins",
    flag: FLAG_KEYS.PLUGIN_SDK,
    group: "Content & platform",
  },
  {
    href: "/api-keys",
    icon: Terminal,
    label: "API keys",
    flag: FLAG_KEYS.API_KEYS,
    group: "Content & platform",
  },
];

/**
 * Apply a user's sidebar preference: items in `orderedIds` come first (in that order), the rest keep
 * their default order; items in `hiddenIds` are dropped. Pure — shared with the customize panel.
 */
export function orderNavItems(
  items: NavItem[],
  orderedIds: string[],
  hiddenIds: string[],
): NavItem[] {
  const hidden = new Set(hiddenIds);
  const rank = new Map(orderedIds.map((href, i) => [href, i]));
  return items
    .filter((it) => !hidden.has(it.href))
    .slice()
    .sort((a, b) => {
      const ra = rank.has(a.href) ? rank.get(a.href)! : Infinity;
      const rb = rank.has(b.href) ? rank.get(b.href)! : Infinity;
      if (ra !== rb) return ra - rb;
      return items.indexOf(a) - items.indexOf(b); // stable: default order for unranked
    });
}

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/") return pathname === "/" || pathname === "/recurring-tasks";
  return pathname.startsWith(href);
}

export function IconRail({ onCreateTask }: IconRailProps) {
  const { isEnabled } = useFeatureFlags();
  const { isDark, setTheme } = useTheme();
  const pathname = usePathname();

  const [{ data: badges }] = useQuery<{
    sidebarBadges: { approvals: number; review: number; attention: number };
  }>({ query: SIDEBAR_BADGES_QUERY });
  const [{ data: pref }] = useQuery<{
    sidebarPreference: { orderedIds: string[]; hiddenIds: string[] };
  }>({ query: SIDEBAR_PREFERENCE_QUERY });

  const badgeFor = useCallback(
    (href: string): number => {
      const b = badges?.sidebarBadges;
      if (!b) return 0;
      if (href === "/attention") return b.attention;
      if (href === "/review") return b.review;
      if (href === "/approvals") return b.approvals;
      return 0;
    },
    [badges],
  );

  const visibleItems = useMemo(
    () =>
      orderNavItems(
        NAV_ITEMS,
        pref?.sidebarPreference?.orderedIds ?? [],
        pref?.sidebarPreference?.hiddenIds ?? [],
      ).filter(({ flag }) => !flag || isEnabled(flag)),
    [pref, isEnabled],
  );

  // Which group the current route belongs to (drives the panel + active rail icon).
  const routeGroup = useMemo<NavGroup>(() => {
    const match = visibleItems.find((it) => isActive(pathname, it.href));
    return match?.group ?? "Overview";
  }, [pathname, visibleItems]);

  const [selectedGroup, setSelectedGroup] = useState<NavGroup>(routeGroup);
  useEffect(() => setSelectedGroup(routeGroup), [routeGroup]);

  const groupBadge = useCallback(
    (group: NavGroup) =>
      visibleItems.filter((it) => it.group === group).reduce((n, it) => n + badgeFor(it.href), 0),
    [visibleItems, badgeFor],
  );

  const visibleGroups = NAV_GROUPS.filter((g) => visibleItems.some((it) => it.group === g));
  const panelItems = visibleItems.filter((it) => it.group === selectedGroup);

  return (
    <div className="flex h-full shrink-0">
      {/* ── Rail: brand + section icons + actions ── */}
      <div className="flex h-full w-[72px] shrink-0 flex-col items-center border-r border-border bg-background py-3">
        <Link
          href="/"
          className="mb-3 flex h-9 w-9 items-center justify-center"
          title="AgentCenter"
        >
          <Image src="/logo.png" alt="AgentCenter" width={28} height={28} className="rounded-md" />
        </Link>

        <div className="flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto">
          {visibleGroups.map((group) => {
            const { icon: Icon, short } = GROUP_META[group];
            const active = selectedGroup === group;
            const count = groupBadge(group);
            return (
              <button
                key={group}
                onClick={() => setSelectedGroup(group)}
                title={group}
                className={`relative flex w-14 flex-col items-center gap-1 rounded-lg py-2 transition-colors ${
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] leading-none">{short}</span>
                {count > 0 && (
                  <span className="absolute right-2 top-1 h-2 w-2 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex flex-col items-center gap-1 pt-2">
          <button
            onClick={onCreateTask}
            title="New task"
            aria-label="New task"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground hover:opacity-90"
          >
            <SquarePen className="h-[18px] w-[18px]" />
          </button>
          <Link
            href="/search"
            title="Search"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Search className="h-[18px] w-[18px]" />
          </Link>
          <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            title="Toggle theme"
            aria-label="Toggle theme"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {isDark ? (
              <Sun className="h-[18px] w-[18px]" />
            ) : (
              <Moon className="h-[18px] w-[18px]" />
            )}
          </button>
          <SupportMenu />

          {/* Account/profile menu (buildbase). The header carries no account menu or workspace switcher. */}
          <AccountMenuSlot />
          {/* Invisible: mounts buildbase's WorkspaceSwitcher so openWorkspaceSettings() (Profile/
              Settings/Billing above) actually renders its modal — the SDK hosts the settings dialog
              inside WorkspaceSwitcher. No visible switcher (one workspace per tenant). */}
          <BuildbaseSettingsHost />
        </div>
      </div>

      {/* ── Panel: items of the selected section ── */}
      <div className="flex h-full w-[216px] shrink-0 flex-col border-r border-border bg-background">
        <div className="flex h-14 shrink-0 items-center px-4">
          <span className="text-sm font-semibold text-foreground">{selectedGroup}</span>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {panelItems.map(({ href, icon: Icon, label }) => {
            const active = isActive(pathname, href);
            const count = badgeFor(href);
            return (
              <Link
                key={href}
                href={href}
                title={label}
                className={`relative flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-primary/10 font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
                )}
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span className="truncate">{label}</span>
                {count > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-none text-primary-foreground">
                    {count > 9 ? "9+" : count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
