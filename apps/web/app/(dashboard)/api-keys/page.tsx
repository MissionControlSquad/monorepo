"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { KeyRound } from "lucide-react";
import { API_KEYS_QUERY } from "@/lib/graphql/queries";
import { REVOKE_API_KEY } from "@/lib/graphql/mutations";
import { Button, Card, Badge, ConfirmDialog, EmptyState } from "@/components/ui";
import { ApiKeyDialog } from "@/components/dialogs/ApiKeyDialog";
import { useConfirmDelete } from "@/hooks/useCrud";

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
  const [{ data, fetching }, refetch] = useQuery<{ apiKeys: ApiKey[] }>({ query: API_KEYS_QUERY });
  const [, revoke] = useMutation(REVOKE_API_KEY);
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState<{ name: string; plainKey: string } | null>(null);
  const keys = data?.apiKeys ?? [];
  const refresh = () => refetch({ requestPolicy: "network-only" });

  const del = useConfirmDelete<ApiKey>({
    onDelete: async (k) => {
      const r = await revoke({ id: k.id });
      return r.error?.message ?? null;
    },
    onDone: refresh,
  });

  return (
    <div className="mx-auto space-y-6 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-foreground">API keys</h1>
          <p className="text-sm text-muted-foreground">
            Personal access tokens for CLI and programmatic access to this workspace. A key is shown
            only once — store it somewhere safe.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>Mint key</Button>
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

      <ApiKeyDialog open={open} onOpenChange={setOpen} onMinted={setRevealed} onSaved={refresh} />

      {keys.length === 0 && !fetching ? (
        <EmptyState
          icon={<KeyRound className="h-8 w-8" />}
          title="No API keys yet"
          description="Mint a key for CLI or programmatic access."
        />
      ) : (
        keys.map((k) => {
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
                <Button size="sm" variant="secondary" onClick={() => del.ask(k)}>
                  Revoke
                </Button>
              )}
            </Card>
          );
        })
      )}

      <ConfirmDialog
        isOpen={del.isOpen}
        onClose={del.cancel}
        onConfirm={del.confirm}
        title="Revoke API key?"
        description={`"${del.target?.name}" will stop working immediately. This can't be undone.`}
        confirmLabel="Revoke"
      />
    </div>
  );
}
