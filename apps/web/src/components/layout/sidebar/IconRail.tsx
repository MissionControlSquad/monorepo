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
  GanttChart,
  Gauge,
  Cpu,
  Container,
  Gavel,
  Building2,
  ClipboardCheck,
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

export interface NavItem {
  href: string;
  icon: typeof LayoutDashboard;
  label: string;
  flag?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", icon: LayoutDashboard, label: "Home" },
  { href: "/search", icon: Search, label: "Search" },
  { href: "/attention", icon: Inbox, label: "Attention", flag: FLAG_KEYS.ATTENTION },
  { href: "/review", icon: ClipboardCheck, label: "Needs my review", flag: FLAG_KEYS.GOVERNANCE },
  { href: "/approvals", icon: Gavel, label: "Approvals", flag: FLAG_KEYS.GOVERNANCE },
  { href: "/agents", icon: Bot, label: "Agents" },
  {
    href: "/adapters",
    icon: Boxes,
    label: "Adapters",
    flag: FLAG_KEYS.MULTI_PROVIDER_ADAPTERS,
  },
  {
    href: "/instructions",
    icon: FileText,
    label: "Instructions",
    flag: FLAG_KEYS.AGENT_INSTRUCTIONS,
  },
  { href: "/org-chart", icon: Network, label: "Org chart", flag: FLAG_KEYS.ORG_CHART },
  { href: "/companies", icon: Building2, label: "Companies", flag: FLAG_KEYS.AGENT_COMPANIES },
  { href: "/agent-authz", icon: Lock, label: "Agent access", flag: FLAG_KEYS.AGENT_AUTHZ },
  { href: "/channels", icon: MessageSquare, label: "Channels", flag: FLAG_KEYS.CHANNELS },
  { href: "/projects", icon: FolderKanban, label: "Projects" },
  { href: "/artifacts", icon: Images, label: "Artifacts" },
  { href: "/assets", icon: FileBox, label: "Assets", flag: FLAG_KEYS.ASSETS },
  { href: "/smoke-lab", icon: FlaskConical, label: "Smoke lab", flag: FLAG_KEYS.SMOKE_LAB },
  { href: "/cloud-upstreams", icon: GitBranch, label: "Cloud upstreams", flag: FLAG_KEYS.CLOUD_UPSTREAMS },
  { href: "/provider-auth", icon: KeyRound, label: "Provider auth", flag: FLAG_KEYS.PROVIDER_AUTH },
  { href: "/timeline", icon: GanttChart, label: "Timeline" },
  { href: "/analytics", icon: BarChart3, label: "Analytics", flag: FLAG_KEYS.ANALYTICS },
  { href: "/runners", icon: Cpu, label: "Runners", flag: FLAG_KEYS.RUNNERS },
  { href: "/environments", icon: Container, label: "Environments", flag: FLAG_KEYS.ENVIRONMENTS },
  { href: "/live-gateway", icon: Zap, label: "Live Gateway", flag: FLAG_KEYS.LIVE_GATEWAY },
  { href: "/finance", icon: CreditCard, label: "Finance", flag: FLAG_KEYS.BUDGETS },
  { href: "/ledger", icon: Receipt, label: "Ledger", flag: FLAG_KEYS.LEDGER },
  { href: "/secrets", icon: KeyRound, label: "Secrets", flag: FLAG_KEYS.SECRETS_VAULT },
  { href: "/routines", icon: Repeat, label: "Routines", flag: FLAG_KEYS.PIPELINES_ROUTINES },
  { href: "/pipelines", icon: Workflow, label: "Pipelines", flag: FLAG_KEYS.PIPELINES_ROUTINES },
  { href: "/reliability", icon: ShieldCheck, label: "Reliability", flag: FLAG_KEYS.TASK_AUTONOMY },
  { href: "/cases", icon: Ticket, label: "Cases", flag: FLAG_KEYS.CASES },
  { href: "/skills", icon: Puzzle, label: "Skills", flag: FLAG_KEYS.SKILLS_TEAMS },
  { href: "/teams", icon: Users, label: "Teams", flag: FLAG_KEYS.SKILLS_TEAMS },
  { href: "/goals", icon: Target, label: "Goals", flag: FLAG_KEYS.GOALS },
  {
    href: "/observability",
    icon: Activity,
    label: "Observability",
    flag: FLAG_KEYS.OBSERVABILITY,
  },
  { href: "/monitors", icon: Gauge, label: "Monitors", flag: FLAG_KEYS.MONITORS },
  { href: "/boardroom", icon: Landmark, label: "Boardroom", flag: FLAG_KEYS.BOARD_CHAT },
  { href: "/plugins", icon: Plug, label: "Plugins", flag: FLAG_KEYS.PLUGIN_SDK },
  { href: "/api-keys", icon: Terminal, label: "API keys", flag: FLAG_KEYS.API_KEYS },
  { href: "/terminals", icon: SquareTerminal, label: "Terminals", flag: FLAG_KEYS.TERMINALS },
  {
    href: "/portability",
    icon: PackageOpen,
    label: "Portability",
    flag: FLAG_KEYS.WORKSPACE_PORTABILITY,
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

  return (
    <div className="w-[60px] h-full flex flex-col items-center border-r border-border bg-background py-3 shrink-0">
      {/* Logo */}
      <Link href="/" className="flex items-center justify-center w-9 h-9 mb-4" title="AgentCenter">
        <Image src="/logo.png" alt="AgentCenter" width={28} height={28} className="rounded-md" />
      </Link>

      {/* Navigation */}
      <nav className="flex flex-col items-center gap-0.5">
        {orderNavItems(
          NAV_ITEMS,
          pref?.sidebarPreference?.orderedIds ?? [],
          pref?.sidebarPreference?.hiddenIds ?? [],
        )
          .filter(({ flag }) => !flag || isEnabled(flag))
          .map(({ href, icon: Icon, label }) => {
            const count = badgeFor(href);
            return (
              <Link
                key={href}
                href={href}
                title={count > 0 ? `${label} (${count})` : label}
                className={`relative w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
                  isActive(pathname, href)
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <Icon className="w-[20px] h-[20px]" />
                {count > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
                    {count > 9 ? "9+" : count}
                  </span>
                )}
              </Link>
            );
          })}
      </nav>

      <div className="flex-1" />

      {/* Support menu */}
      <div className="mb-2">
        <SupportMenu />
      </div>

      {/* New Task */}
      <Button
        variant="primary"
        size="icon"
        onClick={onCreateTask}
        className="rounded-xl mb-2"
        title="New Task"
        aria-label="New Task"
      >
        <SquarePen className="w-[18px] h-[18px]" />
      </Button>

      {/* User avatar + menu */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setUserMenuOpen((v) => !v)}
          className="w-9 h-9 rounded-full overflow-hidden ring-2 ring-transparent hover:ring-gray-200 transition-all"
          title={currentUserProfile?.displayName ?? "Account"}
          aria-label={currentUserProfile?.displayName ?? "Account"}
        >
          {currentUserProfile?.id ? (
            <ProfileAvatar profileId={currentUserProfile.id} size="md+" />
          ) : (
            <span className="w-full h-full bg-muted flex items-center justify-center text-sm font-medium text-muted-foreground">
              ?
            </span>
          )}
        </button>

        {userMenuOpen && (
          <div className="absolute bottom-0 left-full ml-2 w-52 bg-background rounded-lg border border-border shadow-lg z-[100] py-1">
            {currentUserProfile && (
              <div className="px-3 py-2 border-b border-border">
                <p className="text-sm font-medium text-foreground truncate">
                  {currentUserProfile.displayName}
                </p>
                {currentUserProfile.username && (
                  <p className="text-xs text-muted-foreground truncate">
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
                <User className="w-4 h-4 text-muted-foreground" />
                Profile
              </Link>
              <Link
                href="/settings"
                onClick={() => setUserMenuOpen(false)}
                className="flex items-center gap-2.5 px-3 py-1.5 text-sm text-foreground hover:bg-muted transition-colors"
              >
                <Settings className="w-4 h-4 text-muted-foreground" />
                Settings
              </Link>
              <a
                href="https://billing.stripe.com/p/login/dRm7sN0KKdnfbs4afl53O00"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setUserMenuOpen(false)}
                className="flex items-center gap-2.5 px-3 py-1.5 text-sm text-foreground hover:bg-muted transition-colors"
              >
                <CreditCard className="w-4 h-4 text-muted-foreground" />
                Billing
              </a>
              <Button
                variant="ghost"
                onClick={handleLogout}
                className="w-full justify-start gap-2.5 px-3 py-1.5 text-sm text-foreground hover:bg-muted h-auto font-normal rounded-none"
              >
                <LogOut className="w-4 h-4 text-muted-foreground" />
                Log out
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
