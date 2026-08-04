"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  LayoutDashboard,
  Bot,
  MessageSquare,
  FolderKanban,
  BarChart3,
  SquarePen,
  User,
  Settings,
  LogOut,
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
  Container,
  Gavel,
  Building2,
  ClipboardCheck,
  ChevronDown,
} from "lucide-react";
import { useQuery } from "urql";
import {
  SIDEBAR_BADGES_QUERY,
  SIDEBAR_PREFERENCE_QUERY,
} from "@agentcenter/graphql-client/queries";
import { useAppContext } from "../../context/AppContext";
import { useFeatureFlags } from "../../context/FeatureFlagContext";
import { FLAG_KEYS } from "@agentcenter/utils";
import { API_ROUTES } from "@/lib/api-routes";
import { Button } from "../../ui";
import { ProfileAvatar } from "../../ui/ProfileAvatar";
import { SupportMenu } from "../../support/SupportMenu";

interface IconRailProps {
  onCreateTask: () => void;
}

// Sidebar is grouped by domain so ~44 destinations stay scannable instead of one long list.
export type NavGroup =
  | "Overview"
  | "Inbox"
  | "Agents"
  | "Work"
  | "Communication"
  | "Infrastructure"
  | "Finance & insights"
  | "Content & platform";

/** Order the groups render in. */
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
  { href: "/attention", icon: Inbox, label: "Attention", flag: FLAG_KEYS.ATTENTION, group: "Inbox" },
  { href: "/review", icon: ClipboardCheck, label: "Needs my review", flag: FLAG_KEYS.GOVERNANCE, group: "Inbox" },
  { href: "/approvals", icon: Gavel, label: "Approvals", flag: FLAG_KEYS.GOVERNANCE, group: "Inbox" },

  // ── Agents ──
  { href: "/agents", icon: Bot, label: "Agents", group: "Agents" },
  { href: "/skills", icon: Puzzle, label: "Skills", flag: FLAG_KEYS.SKILLS_TEAMS, group: "Agents" },
  { href: "/teams", icon: Users, label: "Teams", flag: FLAG_KEYS.SKILLS_TEAMS, group: "Agents" },
  { href: "/instructions", icon: FileText, label: "Instructions", flag: FLAG_KEYS.AGENT_INSTRUCTIONS, group: "Agents" },
  { href: "/adapters", icon: Boxes, label: "Adapters", flag: FLAG_KEYS.MULTI_PROVIDER_ADAPTERS, group: "Agents" },
  { href: "/adapter-plugins", icon: Puzzle, label: "Adapter plugins", group: "Agents" },
  { href: "/org-chart", icon: Network, label: "Org chart", flag: FLAG_KEYS.ORG_CHART, group: "Agents" },
  { href: "/companies", icon: Building2, label: "Companies", flag: FLAG_KEYS.AGENT_COMPANIES, group: "Agents" },
  { href: "/agent-authz", icon: Lock, label: "Agent access", flag: FLAG_KEYS.AGENT_AUTHZ, group: "Agents" },
  { href: "/agent-insights", icon: Activity, label: "Agent insights", flag: FLAG_KEYS.PRODUCTIVITY_REVIEW, group: "Agents" },

  // ── Work ──
  { href: "/projects", icon: FolderKanban, label: "Projects", group: "Work" },
  { href: "/goals", icon: Target, label: "Goals", flag: FLAG_KEYS.GOALS, group: "Work" },
  { href: "/cases", icon: Ticket, label: "Cases", flag: FLAG_KEYS.CASES, group: "Work" },
  { href: "/routines", icon: Repeat, label: "Routines", flag: FLAG_KEYS.PIPELINES_ROUTINES, group: "Work" },
  { href: "/pipelines", icon: Workflow, label: "Pipelines", flag: FLAG_KEYS.PIPELINES_ROUTINES, group: "Work" },
  { href: "/reliability", icon: ShieldCheck, label: "Reliability", flag: FLAG_KEYS.TASK_AUTONOMY, group: "Work" },
  { href: "/monitors", icon: Gauge, label: "Monitors", flag: FLAG_KEYS.MONITORS, group: "Work" },

  // ── Communication ──
  { href: "/channels", icon: MessageSquare, label: "Channels", flag: FLAG_KEYS.CHANNELS, group: "Communication" },
  { href: "/boardroom", icon: Landmark, label: "Boardroom", flag: FLAG_KEYS.BOARD_CHAT, group: "Communication" },
  { href: "/inbox-policies", icon: MailCheck, label: "Inbox policies", flag: FLAG_KEYS.INBOX_POLICY, group: "Communication" },

  // ── Infrastructure ──
  { href: "/environments", icon: Container, label: "Environments", flag: FLAG_KEYS.ENVIRONMENTS, group: "Infrastructure" },
  { href: "/runners", icon: Cpu, label: "Runners", flag: FLAG_KEYS.RUNNERS, group: "Infrastructure" },
  { href: "/terminals", icon: SquareTerminal, label: "Terminals", flag: FLAG_KEYS.TERMINALS, group: "Infrastructure" },
  { href: "/local-services", icon: ServerCog, label: "Local services", flag: FLAG_KEYS.LOCAL_SERVICES, group: "Infrastructure" },
  { href: "/live-gateway", icon: Zap, label: "Live Gateway", flag: FLAG_KEYS.LIVE_GATEWAY, group: "Infrastructure" },
  { href: "/cloud-upstreams", icon: GitBranch, label: "Cloud upstreams", flag: FLAG_KEYS.CLOUD_UPSTREAMS, group: "Infrastructure" },
  { href: "/provider-auth", icon: KeyRound, label: "Provider auth", flag: FLAG_KEYS.PROVIDER_AUTH, group: "Infrastructure" },
  { href: "/smoke-lab", icon: FlaskConical, label: "Smoke lab", flag: FLAG_KEYS.SMOKE_LAB, group: "Infrastructure" },

  // ── Finance & insights ──
  { href: "/finance", icon: CreditCard, label: "Finance", flag: FLAG_KEYS.BUDGETS, group: "Finance & insights" },
  { href: "/ledger", icon: Receipt, label: "Ledger", flag: FLAG_KEYS.LEDGER, group: "Finance & insights" },
  { href: "/analytics", icon: BarChart3, label: "Analytics", flag: FLAG_KEYS.ANALYTICS, group: "Finance & insights" },
  { href: "/observability", icon: Activity, label: "Observability", flag: FLAG_KEYS.OBSERVABILITY, group: "Finance & insights" },

  // ── Content & platform ──
  { href: "/artifacts", icon: Images, label: "Artifacts", group: "Content & platform" },
  { href: "/assets", icon: FileBox, label: "Assets", flag: FLAG_KEYS.ASSETS, group: "Content & platform" },
  { href: "/portability", icon: PackageOpen, label: "Portability", flag: FLAG_KEYS.WORKSPACE_PORTABILITY, group: "Content & platform" },
  { href: "/secrets", icon: KeyRound, label: "Secrets", flag: FLAG_KEYS.SECRETS_VAULT, group: "Content & platform" },
  { href: "/plugins", icon: Plug, label: "Plugins", flag: FLAG_KEYS.PLUGIN_SDK, group: "Content & platform" },
  { href: "/api-keys", icon: Terminal, label: "API keys", flag: FLAG_KEYS.API_KEYS, group: "Content & platform" },
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

const COLLAPSED_GROUPS_KEY = "sidebar-collapsed-groups";

export function IconRail({ onCreateTask }: IconRailProps) {
  const { currentUserProfile } = useAppContext();
  const { isEnabled } = useFeatureFlags();
  const router = useRouter();
  const pathname = usePathname();
  // Paperclip parity: live actionable counts badged onto the nav.
  const [{ data: badges }] = useQuery<{
    sidebarBadges: { approvals: number; review: number; attention: number };
  }>({ query: SIDEBAR_BADGES_QUERY });
  const [{ data: pref }] = useQuery<{
    sidebarPreference: { orderedIds: string[]; hiddenIds: string[] };
  }>({ query: SIDEBAR_PREFERENCE_QUERY });
  const badgeFor = (href: string): number => {
    const b = badges?.sidebarBadges;
    if (!b) return 0;
    if (href === "/attention") return b.attention;
    if (href === "/review") return b.review;
    if (href === "/approvals") return b.approvals;
    return 0;
  };
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Per-group collapse (persisted). Groups default open.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      return new Set(JSON.parse(localStorage.getItem(COLLAPSED_GROUPS_KEY) || "[]"));
    } catch {
      return new Set();
    }
  });
  const toggleGroup = useCallback((group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const handleLogout = useCallback(async () => {
    setUserMenuOpen(false);
    await fetch(API_ROUTES.auth.logout, { method: "POST" });
    router.push("/login");
  }, [router]);

  useEffect(() => {
    if (!userMenuOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [userMenuOpen]);

  const visibleItems = orderNavItems(
    NAV_ITEMS,
    pref?.sidebarPreference?.orderedIds ?? [],
    pref?.sidebarPreference?.hiddenIds ?? [],
  ).filter(({ flag }) => !flag || isEnabled(flag));

  return (
    <div className="w-60 h-full flex flex-col border-r border-border bg-background shrink-0">
      {/* Brand */}
      <Link
        href="/"
        className="flex items-center gap-2.5 px-4 h-14 shrink-0 border-b border-border"
        title="AgentCenter"
      >
        <Image src="/logo.png" alt="AgentCenter" width={24} height={24} className="rounded-md" />
        <span className="text-sm font-semibold text-foreground">AgentCenter</span>
      </Link>

      {/* Primary action */}
      <div className="px-3 pt-3">
        <Button
          variant="primary"
          onClick={onCreateTask}
          className="w-full justify-start gap-2"
          title="New Task"
        >
          <SquarePen className="w-4 h-4" />
          New task
        </Button>
      </div>

      {/* Grouped navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-3">
        {NAV_GROUPS.map((group) => {
          const items = visibleItems.filter((it) => it.group === group);
          if (items.length === 0) return null;
          const isCollapsed = collapsedGroups.has(group);
          return (
            <div key={group}>
              <button
                onClick={() => toggleGroup(group)}
                className="group/hdr flex w-full items-center justify-between px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70 hover:text-muted-foreground"
                aria-expanded={!isCollapsed}
              >
                <span>{group}</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 opacity-0 transition-all group-hover/hdr:opacity-100 ${
                    isCollapsed ? "-rotate-90" : ""
                  }`}
                />
              </button>
              {!isCollapsed && (
                <div className="space-y-0.5">
                  {items.map(({ href, icon: Icon, label }) => {
                    const count = badgeFor(href);
                    const active = isActive(pathname, href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        title={label}
                        className={`relative flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                          active
                            ? "bg-muted font-medium text-foreground"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
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
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer: account + support */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-3 py-2">
        <div className="relative min-w-0" ref={menuRef}>
          <button
            onClick={() => setUserMenuOpen((v) => !v)}
            className="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted transition-colors"
            title={currentUserProfile?.displayName ?? "Account"}
            aria-label={currentUserProfile?.displayName ?? "Account"}
          >
            {currentUserProfile?.id ? (
              <ProfileAvatar profileId={currentUserProfile.id} size="sm" />
            ) : (
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground">
                ?
              </span>
            )}
            <span className="truncate text-sm text-foreground">
              {currentUserProfile?.displayName ?? "Account"}
            </span>
          </button>

          {userMenuOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-52 rounded-lg border border-border bg-background py-1 shadow-lg z-[100]">
              {currentUserProfile && (
                <div className="border-b border-border px-3 py-2">
                  <p className="truncate text-sm font-medium text-foreground">
                    {currentUserProfile.displayName}
                  </p>
                  {currentUserProfile.username && (
                    <p className="truncate text-xs text-muted-foreground">
                      @{currentUserProfile.username}
                    </p>
                  )}
                </div>
              )}
              <div className="py-0.5">
                <Link
                  href="/profile"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-1.5 text-sm text-foreground hover:bg-muted transition-colors"
                >
                  <User className="h-4 w-4 text-muted-foreground" />
                  Profile
                </Link>
                <Link
                  href="/settings"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-1.5 text-sm text-foreground hover:bg-muted transition-colors"
                >
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  Settings
                </Link>
                <a
                  href="https://billing.stripe.com/p/login/dRm7sN0KKdnfbs4afl53O00"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-1.5 text-sm text-foreground hover:bg-muted transition-colors"
                >
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  Billing
                </a>
                <Button
                  variant="ghost"
                  onClick={handleLogout}
                  className="h-auto w-full justify-start gap-2.5 rounded-none px-3 py-1.5 text-sm font-normal text-foreground hover:bg-muted"
                >
                  <LogOut className="h-4 w-4 text-muted-foreground" />
                  Log out
                </Button>
              </div>
            </div>
          )}
        </div>

        <SupportMenu />
      </div>
    </div>
  );
}
