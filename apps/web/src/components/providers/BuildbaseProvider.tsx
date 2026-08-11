"use client";

import { SaaSOSProvider, useSaaSAuth, PushNotificationProvider } from "@buildbase/sdk/react";
import { ApiVersion, consumeAuthIntent, type EventType, type EventData } from "@buildbase/sdk";
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

function storeAuthToken(token: string) {
  localStorage.setItem("auth_token", token);
}
function storeUserEmail(email: string) {
  if (email) localStorage.setItem("user_email", email);
}
function clearAuthToken() {
  localStorage.removeItem("auth_token");
  localStorage.removeItem("user_email");
}

async function updateAuthToken(userId: string, workspaceId: string, userRole: string) {
  const email = localStorage.getItem("user_email") ?? "";
  const currentToken = localStorage.getItem("auth_token") ?? "";
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

export function BuildbaseProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
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
                    eventData.userRole || "member",
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
            await updateAuthToken(user.id, workspace._id, userRole ?? "member");
          },
        },
      }}
    >
      <BuildbaseReadyContext.Provider value={true}>
        <PostAuthRedirector />
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
