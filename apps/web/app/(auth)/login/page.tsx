"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSaaSAuth } from "@buildbase/sdk/react";
import { Button } from "@/components/ui";
import { Loader2, ShieldAlert } from "lucide-react";
import { LicenseStatusCode } from "@/server/constants";
import { useBuildbaseReady } from "@/components/providers/BuildbaseProvider";
import { resolveLoginMode } from "@/components/auth/login-mode";

// buildbase is the ONLY production auth. There is no admin username/password login: the first
// buildbase user who owns the bound workspace auto-provisions as owner via the auth bridge, and every
// human signs in through buildbase. When buildbase is NOT configured the app is intentionally
// unusable — self-host operators MUST configure NEXT_PUBLIC_SAAS_ORG_ID (there is no fallback).
const BUILDBASE_CONFIGURED = resolveLoginMode(process.env.NEXT_PUBLIC_SAAS_ORG_ID) === "buildbase";

/** Primary (and only) sign-in control. Mounted only once the SDK provider is ready. */
function BuildbaseSignInButton() {
  const { signIn } = useSaaSAuth();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      type="button"
      className="w-full"
      disabled={loading}
      onClick={() => {
        setLoading(true);
        void signIn("/"); // returns to the dashboard root after the OAuth round-trip
      }}
    >
      {loading && <Loader2 className="animate-spin" />}
      {loading ? "Redirecting…" : "Continue with Buildbase"}
    </Button>
  );
}

/** Rendered when buildbase is not configured — the app cannot authenticate anyone. */
function AuthNotConfigured() {
  return (
    <div className="text-center">
      <ShieldAlert className="w-8 h-8 text-muted-foreground mb-3 inline-block" />
      <h2 className="text-sm font-medium text-foreground">Authentication is not configured</h2>
      <p className="mt-1.5 text-xs text-muted-foreground">
        This installation has no identity provider. Set <code>NEXT_PUBLIC_SAAS_ORG_ID</code> (and
        the related <code>SAAS_*</code> credentials) to enable Buildbase sign-in. There is no other
        way in.
      </p>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  // True only when the buildbase SDK provider is actually mounted (client, non-empty org id). Until
  // then we show a disabled placeholder so useSaaSAuth is never called outside its provider.
  const buildbaseReady = useBuildbaseReady();

  useEffect(() => {
    // Still honor the license/activation gate (self-host licensing). Setup is gone — the first
    // buildbase owner provisions automatically — so there is no /setup redirect anymore.
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((data) => {
        if (
          data.license?.status === LicenseStatusCode.NONE ||
          data.license?.status === LicenseStatusCode.EXPIRED ||
          data.license?.status === LicenseStatusCode.INVALID ||
          data.license?.status === LicenseStatusCode.REVOKED
        ) {
          router.replace("/activate");
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-5 h-5 border-2 border-border border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <Image
            src="/logo.png"
            alt="AgentCenter"
            width={48}
            height={48}
            className="w-12 h-12 rounded-xl mb-5 inline-block"
          />
          <h1 className="text-xl font-semibold text-foreground">Welcome back to AgentCenter</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Sign in to manage your AI agent workforce
          </p>
        </div>

        {/* Card */}
        <div className="p-0 sm:rounded-xl sm:border sm:border-border sm:bg-card sm:p-6">
          {BUILDBASE_CONFIGURED ? (
            <div className="space-y-3">
              {buildbaseReady ? (
                <BuildbaseSignInButton />
              ) : (
                <Button type="button" className="w-full" disabled>
                  <Loader2 className="animate-spin" />
                  Loading sign-in…
                </Button>
              )}
              <p className="text-center text-xs text-muted-foreground">
                You&apos;ll be redirected to Buildbase to sign in securely.
              </p>
            </div>
          ) : (
            <AuthNotConfigured />
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          <a
            href="https://agentcenter.cloud"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            agentcenter.cloud
          </a>{" "}
          &middot; Manage your AI agent team
        </p>
      </div>
    </div>
  );
}
