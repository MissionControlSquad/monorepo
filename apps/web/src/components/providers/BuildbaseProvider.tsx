"use client";

import {
  SaaSOSProvider,
  useSaaSAuth,
  useSaaSWorkspaces,
  PushNotificationProvider,
  SUPPORTED_LOCALES,
} from "@buildbase/sdk/react";
import { ApiVersion, consumeAuthIntent, type EventType, type EventData } from "@buildbase/sdk";
import type { SDKLocale } from "@buildbase/sdk/react";
import { WORKSPACE_ROLES } from "@agentcenter/utils";
import React, { createContext, useContext, useEffect, useRef, useState } from "react";

// buildbase human-tenancy provider (Epic #1). Ported from the MissionControlSquad website.
// Guarded: with an empty NEXT_PUBLIC_SAAS_ORG_ID (buildbase not configured), it renders children
// WITHOUT the SDK provider so the existing app keeps working. Auth callbacks target the namespaced
// /api/auth/buildbase/* routes.

const BuildbaseReadyContext = createContext(false);
export function useBuildbaseReady() {
  return useContext(BuildbaseReadyContext);
}

const SERVER_URL = process.env.NEXT_PUBLIC_SAAS_SERVER_URL ?? "";
const ORG_ID = process.env.NEXT_PUBLIC_SAAS_ORG_ID ?? "";
const CLIENT_ID = process.env.NEXT_PUBLIC_SAAS_CLIENT_ID ?? "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

// i18n: the SDK localizes every built-in screen (billing, devices, sessions, connected-agents,
// passkeys, …) from the `locale` prop. We wire the SDK's own i18n only — not an app-wide system.
// Resolution order (first supported wins): per-user override in localStorage ('saas_locale'),
// then the browser's preferred language, then a build-time NEXT_PUBLIC_SAAS_LOCALE default, else 'en'.
const DEFAULT_LOCALE: SDKLocale = "en";
const ENV_LOCALE = process.env.NEXT_PUBLIC_SAAS_LOCALE ?? "";

function isSupportedLocale(value: string): value is SDKLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Resolve the SDK UI locale from a user setting / browser / env default. Always returns a supported code. */
function resolveLocale(): SDKLocale {
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem("saas_locale");
      if (stored && isSupportedLocale(stored)) return stored;
    } catch {
      // localStorage may be unavailable (privacy mode) — fall through.
    }
    const nav = window.navigator?.language?.split("-")[0];
    if (nav && isSupportedLocale(nav)) return nav;
  }
  if (ENV_LOCALE && isSupportedLocale(ENV_LOCALE)) return ENV_LOCALE;
  return DEFAULT_LOCALE;
}

/** localStorage keys for the buildbase client auth token + last-known user email. Single source. */
const AUTH_TOKEN_KEY = "auth_token";
const USER_EMAIL_KEY = "user_email";

function storeAuthToken(token: string) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}
function storeUserEmail(email: string) {
  if (email) localStorage.setItem(USER_EMAIL_KEY, email);
}
/** Clear the buildbase client auth token + email. Exported so sign-out surfaces (e.g. the no-access
 *  page) don't re-hardcode the key names. */
export function clearAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(USER_EMAIL_KEY);
}

async function updateAuthToken(userId: string, workspaceId: string, userRole: string) {
  const email = localStorage.getItem(USER_EMAIL_KEY) ?? "";
  const currentToken = localStorage.getItem(AUTH_TOKEN_KEY) ?? "";
  try {
    const response = await fetch("/api/auth/buildbase/workspace-token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
      },
      body: JSON.stringify({ userId, workspaceId, userRole, email }),
    });
    const data = (await response.json()) as { success?: boolean; token?: string };
    if (data.success && data.token) {
      storeAuthToken(data.token);
      return data.token;
    }
  } catch (error) {
    console.error("Failed to update auth token:", error);
  }
  return null;
}

// Redirects to the saved auth-intent URL after sign-in completes.
function PostAuthRedirector() {
  const { isAuthenticated, isLoading } = useSaaSAuth();
  const prevAuthRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (isLoading) return;
    if (prevAuthRef.current === false && isAuthenticated) {
      const intentUrl = consumeAuthIntent();
      window.location.href = intentUrl ?? "/";
    }
    prevAuthRef.current = isAuthenticated;
  }, [isAuthenticated, isLoading]);
  return null;
}

// Pins the SDK's currentWorkspace to THIS container's bound workspace (TENANT_WORKSPACE_ID). Without
// this, the SDK defaults to the user's default workspace, so every tenant's settings/billing modal (and
// useSubscription, quotas, etc.) shows the SAME workspace regardless of which one the tenant is bound to.
// The bound id is server-only, so we fetch it from /api/auth/status (not a NEXT_PUBLIC var, which a
// runtime-injected per-tenant value can't reach in a prebuilt image). No-op when unbound (self-host).
function WorkspacePinner() {
  const { workspaces, currentWorkspace, switchToWorkspace } = useSaaSWorkspaces();
  // undefined = still loading; null = unbound (self-host); string = the bound workspace id.
  const [boundId, setBoundId] = useState<string | null | undefined>(undefined);
  const pinnedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((d: { boundWorkspaceId?: string | null }) => {
        if (!cancelled) setBoundId(d.boundWorkspaceId ?? null);
      })
      .catch(() => {
        if (!cancelled) setBoundId(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (pinnedRef.current) return;
    if (!boundId) return; // still loading (undefined) or unbound (null) → nothing to pin
    if (currentWorkspace?._id === boundId) {
      pinnedRef.current = true; // already on the bound workspace
      return;
    }
    const target = (workspaces ?? []).find((w) => w._id === boundId);
    if (target) {
      pinnedRef.current = true;
      // Switch TO the bound workspace (allowed — it IS this tenant's workspace; the server switch-block
      // only refuses OTHER workspaces). This also re-mints the app token scoped to the bound workspace.
      void switchToWorkspace(target);
    }
  }, [boundId, workspaces, currentWorkspace, switchToWorkspace]);

  return null;
}

export function BuildbaseProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  // Resolved on the client (reads localStorage / navigator); the SDK branch below only mounts
  // client-side, so this is always a real user/browser-derived locale by the time it's used.
  const [locale] = useState<SDKLocale>(resolveLocale);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Don't render SaaSOSProvider during SSR/prerender or when buildbase is not configured
  // (empty ORG_ID) — the SDK throws on an empty orgId. The app runs normally on the existing
  // admin auth until buildbase credentials are supplied.
  if (!mounted || !ORG_ID) {
    return (
      <BuildbaseReadyContext.Provider value={false}>{children}</BuildbaseReadyContext.Provider>
    );
  }

  return (
    <SaaSOSProvider
      serverUrl={SERVER_URL}
      version={ApiVersion.V1}
      orgId={ORG_ID}
      locale={locale}
      auth={{
        clientId: CLIENT_ID,
        redirectUrl: APP_URL,
        callbacks: {
          getSession: async () => {
            const res = await fetch("/api/auth/buildbase/session");
            const data = (await res.json()) as { sessionId?: string | null };
            return data.sessionId ?? null;
          },
          handleAuthentication: async (code: string) => {
            const response = await fetch("/api/auth/buildbase/token", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code }),
            });
            // 403 = authenticated with buildbase but NOT a member of this tenant's bound workspace. No
            // session was set (fail-closed). Send them to the clear /no-access page instead of looping
            // back to /login with a vague "sign-in didn't complete" — mirrors the SSO route's behavior.
            if (response.status === 403) {
              window.location.href = "/no-access";
              return { sessionId: "" };
            }
            const data = (await response.json()) as {
              success?: boolean;
              sessionId?: string;
              token?: string;
              user?: { email?: string };
            };
            if (data.success && data.token) storeAuthToken(data.token);
            if (data.user?.email) storeUserEmail(data.user.email);
            return { sessionId: data.sessionId ?? "" };
          },
          onSignOut: async () => {
            clearAuthToken();
            await fetch("/api/auth/buildbase/logout", { method: "POST" });
          },
          handleEvent: async (eventType: EventType, data: EventData) => {
            try {
              if (eventType === "workspace:changed") {
                const eventData = data as unknown as {
                  workspace: { _id: string };
                  user: { _id: string; id?: string };
                  userRole?: string;
                };
                if (eventData.workspace && eventData.user) {
                  const userId = eventData.user.id || eventData.user._id;
                  await updateAuthToken(
                    userId,
                    eventData.workspace._id,
                    eventData.userRole || WORKSPACE_ROLES.MEMBER,
                  );
                }
              }
              if (eventType === "workspace:user-added") {
                const eventData = data as unknown as {
                  userId: string;
                  workspace: { _id: string };
                  role: string;
                };
                await updateAuthToken(eventData.userId, eventData.workspace._id, eventData.role);
              }
            } catch (error) {
              console.error("Failed to handle buildbase event:", error);
            }
          },
          onWorkspaceChange: async (params) => {
            const { user, workspace, role: userRole } = params;
            if (!user?.id || !workspace?._id) return;
            const email =
              (user as unknown as { email?: string }).email ??
              localStorage.getItem("user_email") ??
              "";
            if (email) storeUserEmail(email);
            await updateAuthToken(user.id, workspace._id, userRole ?? WORKSPACE_ROLES.MEMBER);
          },
        },
      }}
    >
      <BuildbaseReadyContext.Provider value={true}>
        <PostAuthRedirector />
        <WorkspacePinner />
        {/*
          Web-push provider. NOT part of SaaSOSProvider, so we mount it explicitly — only inside the
          ready branch (SaaSOSProvider supplies the serverUrl/orgId/session context PushApi needs).
          It registers the service worker committed at /push-sw.js (the SDK default path, generated
          from PUSH_SERVICE_WORKER_SCRIPT — see scripts/generate-push-sw.mjs). autoSubscribe stays
          false: subscribing is an explicit, per-device opt-in from the settings UI so we never
          request the browser permission unprompted. Dormant until an org is provisioned.
        */}
        <PushNotificationProvider serviceWorkerPath="/push-sw.js" autoSubscribe={false}>
          {children}
        </PushNotificationProvider>
      </BuildbaseReadyContext.Provider>
    </SaaSOSProvider>
  );
}
