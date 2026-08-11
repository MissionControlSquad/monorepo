"use client";

import Link from "next/link";
import { ShieldCheck, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui";

// Settings entry point into the self-service Account & security surface (/account): sessions,
// devices, connected agents and passkeys. Always visible — the target page renders a graceful
// "available once provisioned" state while buildbase is dormant, so this never dead-ends.
export function AccountSecurityCard() {
  return (
    <Card padding="none">
      <Link
        href="/account"
        className="flex items-center gap-4 rounded-xl p-5 transition-colors hover:bg-muted"
      >
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ShieldCheck className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">Account &amp; security</h2>
          <p className="text-sm text-muted-foreground">
            Your active sessions, devices, connected AI agents and passkeys.
          </p>
        </div>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </Card>
  );
}
