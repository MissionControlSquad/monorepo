"use client";

import Image from "next/image";
import { Button } from "@/components/ui";
import { clearAuthToken } from "@/components/providers/BuildbaseProvider";

// Shown when a buildbase-authenticated user reaches this tenant dashboard but is NOT a member of the
// workspace it is bound to (the cross-tenant membership check in the auth bridge denied them). No app
// session is minted; this page only offers a way out. See src/server/auth/buildbase-bridge.ts.

const LANDING_URL = process.env.NEXT_PUBLIC_LANDING_URL || "https://agentcenter.cloud";

export default function NoAccessPage() {
  async function signOut() {
    try {
      await fetch("/api/auth/buildbase/logout", { method: "POST" });
    } catch {
      // best-effort — navigate away regardless
    }
    try {
      clearAuthToken();
    } catch {
      // ignore
    }
    window.location.href = LANDING_URL;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm text-center">
        <Image
          src="/logo.png"
          alt="AgentCenter"
          width={48}
          height={48}
          className="w-12 h-12 rounded-xl mb-5 inline-block"
        />
        <h1 className="text-xl font-semibold text-foreground">You don&apos;t have access</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account isn&apos;t a member of this workspace. If you believe this is a mistake, ask
          a workspace owner to invite you, or switch to a workspace you belong to.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button className="w-full" onClick={signOut}>
            Sign out
          </Button>
          <a
            href={LANDING_URL}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Back to agentcenter.cloud
          </a>
        </div>
      </div>
    </div>
  );
}
