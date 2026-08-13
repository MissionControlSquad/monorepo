"use client";

import { useState, useEffect, useRef } from "react";
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

// If we auto-redirected to buildbase within this window and landed back on /login, the sign-in was
// cancelled or failed — so we STOP auto-redirecting and show a manual button instead of looping.
const AUTO_REDIRECT_GUARD_MS = 20_000;
const GUARD_KEY = "bb_auto_signin_at";

/**
 * The only sign-in path. Mounted once the SDK provider is ready. Rather than making the user click an
 * intermediate "Continue with Buildbase" button, it redirects STRAIGHT to buildbase on mount (single
 * login screen). A recent-attempt guard prevents an infinite loop when the user cancels/fails on
 * buildbase and is returned here; in that case it falls back to a manual retry button.
 */
function BuildbaseSignIn() {
  const { signIn, isAuthenticated } = useSaaSAuth();
  const router = useRouter();
  const [manual, setManual] = useState(false);
  // True while a buildbase OAuth callback (?bb=…) is present — the SDK provider is exchanging the code
  // here; we must NOT auto-redirect back to buildbase or we'd discard the code mid-exchange.
  const [completing, setCompleting] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    // OAuth callback in flight: the middleware forwarded ?bb=<code> here for the SDK provider to
    // exchange. Do nothing (show "Completing sign-in…") and let the provider finish + navigate.
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("bb")) {
      setCompleting(true);
      return;
    }
    // Already authenticated (e.g. arrived here with a live session) → go to the dashboard, don't sign in again.
    if (isAuthenticated) {
      started.current = true;
      router.replace("/");
      return;
    }
    // Loop guard: a recent auto-redirect that returned here means cancel/failure → show manual retry.
    let last = 0;
    try {
      last = Number(sessionStorage.getItem(GUARD_KEY) ?? 0);
    } catch {
      /* sessionStorage unavailable — fall through to auto-redirect */
    }
    if (Date.now() - last < AUTO_REDIRECT_GUARD_MS) {
      setManual(true);
      return;
    }
    started.current = true;
    try {
      sessionStorage.setItem(GUARD_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    void signIn("/"); // full-page redirect to buildbase; returns to the dashboard root after OAuth
  }, [isAuthenticated, signIn, router]);

  if (completing) {
    // OAuth callback being exchanged for a session by the provider — then it navigates to the dashboard.
    return (
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Completing sign-in…</p>
      </div>
    );
  }

  if (manual) {
    return (
      <div className="space-y-3">
        <Button
          type="button"
          className="w-full"
          onClick={() => {
            try {
              sessionStorage.setItem(GUARD_KEY, String(Date.now()));
            } catch {
              /* ignore */
            }
            void signIn("/");
          }}
        >
          Continue with Buildbase
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Sign-in didn&apos;t complete. Click to try again.
        </p>
      </div>
    );
  }

  // Auto-redirecting to buildbase — brief transitional state before the page navigates away.
  return (
    <div className="flex flex-col items-center gap-3 py-2 text-center">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Redirecting to Buildbase to sign in…</p>
    </div>
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
            buildbaseReady ? (
              <BuildbaseSignIn />
            ) : (
              <div className="flex flex-col items-center gap-3 py-2 text-center">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading sign-in…</p>
              </div>
            )
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
