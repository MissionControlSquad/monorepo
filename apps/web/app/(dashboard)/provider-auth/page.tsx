"use client";

import { useState } from "react";
import { useQuery } from "urql";
import { KeyRound } from "lucide-react";
import { PROVIDER_AUTH_STATES_QUERY } from "@/lib/graphql/queries";
import { Card, Badge, Button, EmptyState } from "@/components/ui";

// Provider auth reconciliation (parity #25). PROVIDER_AUTH-gated, admin. Read-only health view of AI
// provider credentials (Codex/OpenAI/…): valid/expiring/expired/revoked. The runtime records these; the
// refresh/reauth action is the infra seam.
interface ProviderAuth {
  id: string; provider: string; accountRef: string; state: string; scopes: string[];
  expiresAt: string | null; lastCheckedAt: string | null;
}
const stateVariant = (s: string) =>
  s === "valid" ? "green" : s === "expiring" ? "yellow" : s === "expired" || s === "revoked" ? "red" : "gray";

export default function ProviderAuthPage() {
  const [needsAttention, setNeedsAttention] = useState(false);
  const [{ data, fetching }] = useQuery<{ providerAuthStates: ProviderAuth[] }>({
    query: PROVIDER_AUTH_STATES_QUERY,
    variables: { needsAttention },
  });
  const rows = data?.providerAuthStates ?? [];

  return (
    <div className="mx-auto space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Provider auth</h1>
          <p className="text-sm text-muted-foreground">Health of AI provider credentials.</p>
        </div>
        <Button variant={needsAttention ? "primary" : "ghost"} size="sm" onClick={() => setNeedsAttention((v) => !v)}>
          {needsAttention ? "Showing needs-attention" : "Show all"}
        </Button>
      </div>
      {rows.length === 0 && !fetching ? (
        <EmptyState icon={<KeyRound className="h-8 w-8" />} title="No provider credentials tracked" description="Provider auth state is recorded by the runtime." />
      ) : (
        <Card padding="none">
          <ul className="divide-y divide-border">
            {rows.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{p.provider} · <span className="font-mono text-xs">{p.accountRef}</span></p>
                  <p className="text-xs text-muted-foreground">
                    {p.expiresAt ? `expires ${new Date(p.expiresAt).toLocaleString()}` : "no expiry"}
                    {p.scopes.length ? ` · ${p.scopes.join(", ")}` : ""}
                  </p>
                </div>
                <Badge variant={stateVariant(p.state)}>{p.state}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
