"use client";

import { CreditCard, LogIn, LogOut, Settings, Sparkles, Wallet } from "lucide-react";
import { useSaaSAuth, WhenAuthenticated, WhenUnauthenticated } from "@buildbase/sdk/react";
import { useBuildbaseReady } from "@/components/providers/BuildbaseProvider";
import { Button, ProfileAvatar, Tooltip } from "@/components/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";

/**
 * buildbase SaaS sign-in + account menu for the app shell header (Epic — buildbase auth/billing).
 *
 * COEXISTENCE: this is the buildbase customer sign-in, ADDITIVE to (never replacing) the app's own
 * admin username/password login at /login. It only appears/activates when buildbase is configured
 * (an org is provisioned) — otherwise `useBuildbaseReady()` is false and this renders NOTHING, so
 * the existing admin session UI is untouched.
 *
 * All the account/billing/credits/plan screens are buildbase's own INBUILT dialogs — we merely open
 * them via useSaaSAuth (openWorkspaceSettings / openCreditStore / openPlanPicker). Dormant-safe:
 * the SDK hooks are no-op fallbacks until an org is provisioned.
 */

function currentUrl(): string {
  if (typeof window === "undefined") return "/";
  return window.location.href;
}

function SignInButton() {
  const { signIn, isRedirecting } = useSaaSAuth();
  return (
    <Tooltip content="Sign in to your workspace with buildbase">
      <Button
        variant="secondary"
        size="sm"
        disabled={isRedirecting}
        onClick={() => void signIn(currentUrl())}
        className="gap-1.5"
      >
        <LogIn className="h-4 w-4" aria-hidden="true" />
        <span>Sign in</span>
      </Button>
    </Tooltip>
  );
}

function AccountMenu() {
  const { user, signOut, openWorkspaceSettings, openCreditStore, openPlanPicker } = useSaaSAuth();
  const name = user?.name || user?.email || "Account";

  return (
    <DropdownMenu>
      <Tooltip content={`Signed in as ${name}`}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Account menu"
            className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ProfileAvatar src={user?.image} name={name} size="sm+" />
            <span className="hidden max-w-[140px] truncate sm:inline">{name}</span>
          </button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span className="truncate font-medium text-foreground">{name}</span>
          {user?.email && user.email !== name ? (
            <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => openWorkspaceSettings()}>
          <Settings className="h-4 w-4" aria-hidden="true" />
          Account settings
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openWorkspaceSettings("subscription")}>
          <CreditCard className="h-4 w-4" aria-hidden="true" />
          Billing
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openCreditStore()}>
          <Wallet className="h-4 w-4" aria-hidden="true" />
          Credits &amp; store
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openPlanPicker()}>
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          Upgrade plan
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => void signOut()}>
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Header slot. Renders nothing unless buildbase is configured (dormant-safe). When configured it
 * shows a "Sign in" button for unauthenticated visitors and the account menu once signed in.
 */
export function AccountMenuSlot() {
  const ready = useBuildbaseReady();
  if (!ready) return null;
  return (
    <>
      <WhenUnauthenticated>
        <SignInButton />
      </WhenUnauthenticated>
      <WhenAuthenticated>
        <AccountMenu />
      </WhenAuthenticated>
    </>
  );
}
