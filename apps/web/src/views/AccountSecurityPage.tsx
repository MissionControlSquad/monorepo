"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { MonitorSmartphone, Laptop, Bot, ShieldCheck, ArrowLeft } from "lucide-react";
import { Sessions, Devices, ConnectedAgents, ConnectMcpGuide } from "@buildbase/sdk/react";
import { useBuildbaseReady } from "@/components/providers/BuildbaseProvider";
import { AccountPasskeysCard } from "@/components/account/AccountPasskeysCard";
import { Breadcrumbs, Card, PageLayout, Tooltip, EmptyState } from "@/components/ui";

// Account & security — the signed-in user's OWN account surface (self-service; no admin gate).
// Renders buildbase's ready-made, session-scoped SDK screens: live Sessions (revoke), Devices
// (rename / sign-out / forget), Connected agents (revoke authorized AI agents) + the Connect-an-agent
// guide, and passkeys (managed in the SDK security screen, with an optional read-only list here).
//
// Everything degrades gracefully: while buildbase is DORMANT (not provisioned) the SDK provider is
// absent, so we render a friendly "available once your workspace is provisioned" state instead of the
// hooks (which would have no data). Once provisioned, the real screens render.

/** Section wrapper: our themed Card + a heading with an explanatory tooltip, then the SDK screen. */
function Section({
  icon,
  title,
  hint,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card padding="lg" className="space-y-4">
      <div className="flex items-start gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            <Tooltip side="bottom" content={hint}>
              <span
                tabIndex={0}
                aria-label={`About ${title}`}
                className="cursor-help text-xs text-muted-foreground underline decoration-dotted underline-offset-2"
              >
                What&apos;s this?
              </span>
            </Tooltip>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}

function DormantState() {
  return (
    <Card padding="lg">
      <EmptyState
        icon={<ShieldCheck className="size-6" aria-hidden />}
        title="Account & security is almost ready"
        description="Live sessions, devices, connected agents and passkeys become available once your workspace is provisioned on buildbase. Until then, the app runs on its built-in admin auth and there's nothing to manage here yet."
      />
    </Card>
  );
}

export function AccountSecurityPage() {
  const ready = useBuildbaseReady();

  return (
    <PageLayout maxWidth="wide">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Settings", href: "/settings" },
          { label: "Account & security" },
        ]}
      />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Account &amp; security</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your sessions, devices, authorized agents and passkeys.
          </p>
        </div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Settings
        </Link>
      </div>

      {!ready ? (
        <DormantState />
      ) : (
        <>
          {/* Passkeys — button into the SDK security screen + optional read-only list. */}
          <AccountPasskeysCard />

          {/* Live sessions — every signed-in session, revocable. */}
          <Section
            icon={<ShieldCheck className="size-5 text-muted-foreground" aria-hidden />}
            title="Active sessions"
            hint="A session is one active sign-in. Signing a session out immediately revokes its access; the session you're using now can't be signed out from here (use Sign out)."
            description="Everywhere you're currently signed in. Sign out any session you don't recognize."
          >
            <Sessions title={null} description={null} />
          </Section>

          {/* Devices — login history, rename / sign-out / forget. */}
          <Section
            icon={<Laptop className="size-5 text-muted-foreground" aria-hidden />}
            title="Devices"
            hint="A device is a browser or app you've signed in from. Signing a device out revokes its live sessions but keeps the history row; Remove also deletes the row."
            description="Browsers and apps you've used. Rename them, sign them out, or forget them entirely."
          >
            <Devices title={null} description={null} />
          </Section>

          {/* Connected agents — authorized AI agents, revocable, + connect guide. */}
          <Section
            icon={<Bot className="size-5 text-muted-foreground" aria-hidden />}
            title="Connected agents"
            hint="AI agents (ChatGPT, Claude, Cursor, …) you've authorized to access your account over MCP. Disconnect any you no longer use to revoke its access."
            description="AI assistants you've granted access to your account. Disconnect any you no longer trust."
          >
            <ConnectedAgents title={null} description={null} />
            {/* The connect-an-agent guide (server address + copy-paste setup). Renders null when no
                MCP url is configured on the provider, so it's safe to always include. */}
            <div className="mt-4">
              <ConnectMcpGuide />
            </div>
          </Section>

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MonitorSmartphone className="size-3.5" aria-hidden />
            These controls are scoped to your own account and take effect immediately.
          </p>
        </>
      )}
    </PageLayout>
  );
}
