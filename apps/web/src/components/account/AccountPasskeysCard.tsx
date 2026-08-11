"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { KeyRound, ShieldCheck, Pencil, Trash2, RefreshCw } from "lucide-react";
import { WorkspaceApi, useSaaSAuth, useTranslation } from "@buildbase/sdk/react";
import { ApiVersion } from "@buildbase/sdk";
import { Button, Card, Tooltip, Spinner } from "@/components/ui";

// Structural mirror of the SDK's internal IPasskeySummary (not exported publicly). WorkspaceApi
// .getPasskeys() returns this shape; keeping a local type avoids depending on a non-exported name.
interface IPasskeySummary {
  id: string;
  name: string;
  deviceType?: string;
  backedUp?: boolean;
  lastUsedAt?: string;
  createdAt?: string;
  rpId?: string;
  active?: boolean;
}

// Passkeys (WebAuthn) management. Registration/verification lives in the SDK's built-in security
// screen — we open it via openWorkspaceSettings('security'). On top of that we render an OPTIONAL
// read-only list of the user's existing passkeys with rename/delete, fetched through WorkspaceApi.
//
// WorkspaceApi is session-authed. Inside the browser we can't read the httpOnly bb-session-id cookie,
// so we mint a WorkspaceApi with the sessionId returned by /api/auth/buildbase/session (the same
// endpoint the SDK provider uses). All calls degrade gracefully — any failure shows a soft message.

const SERVER_URL = process.env.NEXT_PUBLIC_SAAS_SERVER_URL ?? "";
const ORG_ID = process.env.NEXT_PUBLIC_SAAS_ORG_ID ?? "";

async function fetchSessionId(): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/buildbase/session");
    const data = (await res.json()) as { sessionId?: string | null };
    return data.sessionId ?? null;
  } catch {
    return null;
  }
}

export function AccountPasskeysCard() {
  const { t } = useTranslation();
  const { openWorkspaceSettings } = useSaaSAuth();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [passkeys, setPasskeys] = useState<IPasskeySummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // A WorkspaceApi bound to the current session — recreated only when the session id changes.
  const api = useMemo(() => {
    if (!sessionId || !SERVER_URL || !ORG_ID) return null;
    return new WorkspaceApi({
      serverUrl: SERVER_URL,
      version: ApiVersion.V1,
      orgId: ORG_ID,
      sessionId,
    });
  }, [sessionId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const sid = await fetchSessionId();
    setSessionId(sid);
    if (!sid || !SERVER_URL || !ORG_ID) {
      // No session yet (or misconfigured) — leave the list empty; the manage button still works.
      setPasskeys(null);
      setLoading(false);
      return;
    }
    try {
      const client = new WorkspaceApi({
        serverUrl: SERVER_URL,
        version: ApiVersion.V1,
        orgId: ORG_ID,
        sessionId: sid,
      });
      const list = await client.getPasskeys();
      setPasskeys(list);
    } catch {
      setError(t("settings.common.error"));
      setPasskeys(null);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRename = useCallback(
    async (passkey: IPasskeySummary) => {
      if (!api) return;
      const next = window.prompt("Rename passkey", passkey.name);
      if (next == null) return;
      const name = next.trim();
      if (!name || name === passkey.name) return;
      setBusyId(passkey.id);
      try {
        await api.renamePasskey(passkey.id, name);
        setPasskeys((prev) => (prev ?? []).map((p) => (p.id === passkey.id ? { ...p, name } : p)));
        toast.success(t("settings.common.success"));
      } catch {
        toast.error(t("settings.common.error"));
      } finally {
        setBusyId(null);
      }
    },
    [api, t],
  );

  const onDelete = useCallback(
    async (passkey: IPasskeySummary) => {
      if (!api) return;
      if (!window.confirm(`Delete passkey "${passkey.name}"? This can't be undone.`)) return;
      setBusyId(passkey.id);
      try {
        await api.deletePasskey(passkey.id);
        setPasskeys((prev) => (prev ?? []).filter((p) => p.id !== passkey.id));
        toast.success(t("settings.common.success"));
      } catch {
        toast.error(t("settings.common.error"));
      } finally {
        setBusyId(null);
      }
    },
    [api, t],
  );

  return (
    <Card padding="lg" className="space-y-4">
      <div className="flex items-start gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <KeyRound className="size-5 text-muted-foreground" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">Passkeys</h2>
            <Tooltip
              side="bottom"
              content="Passkeys let you sign in with your device's biometrics or PIN instead of a password — phishing-resistant and nothing to remember. Add or verify one from the security screen."
            >
              <span
                tabIndex={0}
                aria-label="What are passkeys?"
                className="cursor-help text-xs text-muted-foreground underline decoration-dotted underline-offset-2"
              >
                What&apos;s this?
              </span>
            </Tooltip>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Passwordless sign-in bound to your devices. Adding and verifying a passkey happens in
            the secure security screen; your existing passkeys are listed below.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => openWorkspaceSettings("security")}
          className="shrink-0"
        >
          <ShieldCheck className="mr-1.5 size-4" aria-hidden />
          Manage passkeys / security
        </Button>
      </div>

      <div className="rounded-lg border border-border">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Your passkeys
          </span>
          <Tooltip side="bottom" content="Refresh the list">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              aria-label="Refresh passkeys"
              className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
            </button>
          </Tooltip>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
            <Spinner className="size-4" /> Loading passkeys…
          </div>
        ) : error ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            Couldn&apos;t load your passkeys.{" "}
            <button
              type="button"
              onClick={() => void load()}
              className="text-primary underline underline-offset-2"
            >
              Try again
            </button>
          </div>
        ) : !passkeys || passkeys.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            No passkeys yet. Use{" "}
            <button
              type="button"
              onClick={() => openWorkspaceSettings("security")}
              className="text-primary underline underline-offset-2"
            >
              Manage passkeys / security
            </button>{" "}
            to add one.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {passkeys.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 truncate text-sm font-medium text-foreground">
                    {p.name}
                    {p.active === false && (
                      <Tooltip
                        side="bottom"
                        content="This passkey can no longer sign in because the workspace's auth domain changed."
                      >
                        <span className="rounded bg-warning-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-warning">
                          inactive
                        </span>
                      </Tooltip>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {p.deviceType ? `${p.deviceType} · ` : ""}
                    {p.lastUsedAt
                      ? `Last used ${new Date(p.lastUsedAt).toLocaleDateString()}`
                      : p.createdAt
                        ? `Added ${new Date(p.createdAt).toLocaleDateString()}`
                        : "Passkey"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Tooltip side="bottom" content="Rename this passkey">
                    <button
                      type="button"
                      onClick={() => void onRename(p)}
                      disabled={busyId === p.id}
                      aria-label={`Rename ${p.name}`}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50"
                    >
                      <Pencil className="size-4" aria-hidden />
                    </button>
                  </Tooltip>
                  <Tooltip side="bottom" content="Delete this passkey">
                    <button
                      type="button"
                      onClick={() => void onDelete(p)}
                      disabled={busyId === p.id}
                      aria-label={`Delete ${p.name}`}
                      className="rounded p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </Tooltip>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
