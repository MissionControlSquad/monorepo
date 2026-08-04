"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { API_KEYS_QUERY } from "@/lib/graphql/queries";
import { MINT_API_KEY, REVOKE_API_KEY } from "@/lib/graphql/mutations";
import { Button, Card, Badge } from "@/components/ui";

// Epic #12: API keys for CLI / programmatic access. API_KEYS-gated, admin. The plaintext key is shown
// exactly once at mint (reveal banner); afterwards only the prefix is visible.

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export default function ApiKeysPage() {
  const [{ data }, refetch] = useQuery<{ apiKeys: ApiKey[] }>({ query: API_KEYS_QUERY });
  const [, mint] = useMutation(MINT_API_KEY);
  const [, revoke] = useMutation(REVOKE_API_KEY);

  const [name, setName] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ name: string; plainKey: string } | null>(null);
  const keys = data?.apiKeys ?? [];
  const refresh = () => refetch({ requestPolicy: "network-only" });

  async function onMint() {
    setError(null);
    if (!name.trim()) return setError("Name is required");
    setBusy("mint");
    try {
      const res = await mint({
        name: name.trim(),
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      if (res.error) return setError(res.error.graphQLErrors[0]?.message ?? "Mint failed");
      setRevealed({ name: name.trim(), plainKey: res.data.mintApiKey.plainKey });
      setName("");
      setExpiresAt("");
      refresh();
    } finally {
      setBusy(null);
    }
  }

  async function onRevoke(id: string) {
    setBusy(id);
    try {
      await revoke({ id });
      refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">API keys</h1>
        <p className="text-sm text-muted-foreground">
          Personal access tokens for CLI and programmatic access to this workspace. A key is shown
          only once — store it somewhere safe.
        </p>
      </div>

      {revealed && (
        <Card className="space-y-2 border-success bg-success-muted p-4">
          <p className="text-sm font-medium text-foreground">
            New key “{revealed.name}” — copy it now, it won&apos;t be shown again.
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              className="w-full rounded border border-border bg-background px-3 py-1.5 font-mono text-xs"
              value={revealed.plainKey}
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button size="sm" onClick={() => navigator.clipboard?.writeText(revealed.plainKey)}>
              Copy
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setRevealed(null)}>
              Dismiss
            </Button>
          </div>
        </Card>
      )}

      <Card className="flex flex-wrap items-end gap-2 p-4">
        <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
          Name
          <input
            className="rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground"
            placeholder="e.g. ci-deploy"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Expires (optional)
          <input
            type="date"
            className="rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </label>
        <Button size="sm" disabled={!name.trim() || busy === "mint"} onClick={onMint}>
          Mint key
        </Button>
      </Card>
      {error && <p className="-mt-4 text-sm text-destructive">{error}</p>}

      {keys.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">No API keys yet.</Card>
      )}

      {keys.map((k) => {
        const revoked = !!k.revokedAt;
        const expired = !!k.expiresAt && new Date(k.expiresAt).getTime() <= Date.now();
        return (
          <Card key={k.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">{k.name}</span>
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                {k.keyPrefix}…
              </code>
              {revoked && <Badge variant="red">revoked</Badge>}
              {!revoked && expired && <Badge variant="yellow">expired</Badge>}
              {!revoked && !expired && <Badge variant="green">active</Badge>}
              <span className="text-xs text-muted-foreground">
                {k.lastUsedAt
                  ? `last used ${new Date(k.lastUsedAt).toLocaleDateString()}`
                  : "never used"}
              </span>
            </span>
            {!revoked && (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy === k.id}
                onClick={() => onRevoke(k.id)}
              >
                Revoke
              </Button>
            )}
          </Card>
        );
      })}
    </div>
  );
}
