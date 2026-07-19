"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "urql";
import { Boxes } from "lucide-react";
import { Card, Badge, Button, Spinner, EmptyState } from "@/components/ui";

// Epic #2 (Adapter Manager): instance-admin view of installed provider adapters. MULTI_PROVIDER_ADAPTERS
// gated. Lists each adapter with its transport/auth kind + model-profile count and lets an admin
// enable/disable it. The builtIn openclaw-gateway can never be disabled (existing agents rely on it).

const ADAPTERS_QUERY = `
  query {
    agentAdapters {
      type
      displayName
      transport
      authKind
      version
      enabled
      builtIn
      modelProfiles { id }
    }
  }
`;

const SET_ADAPTER_ENABLED = `
  mutation ($type: String!, $enabled: Boolean!) {
    setAdapterEnabled(adapterType: $type, enabled: $enabled) {
      type
      enabled
    }
  }
`;

interface Adapter {
  type: string;
  displayName: string;
  transport: string;
  authKind: string;
  version: string;
  enabled: boolean;
  builtIn: boolean;
  modelProfiles: { id: string }[];
}

export default function AdaptersPage() {
  const [{ data, fetching }, refetch] = useQuery<{ agentAdapters: Adapter[] }>({
    query: ADAPTERS_QUERY,
  });
  const [, setEnabled] = useMutation(SET_ADAPTER_ENABLED);
  const [busy, setBusy] = useState<string | null>(null);
  const adapters = useMemo(() => data?.agentAdapters ?? [], [data]);

  async function toggle(a: Adapter) {
    setBusy(a.type);
    try {
      await setEnabled({ type: a.type, enabled: !a.enabled });
      refetch({ requestPolicy: "network-only" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Adapters</h1>
        <p className="text-sm text-muted-foreground">
          Provider adapters agents can run on. Enable the ones your organization uses; assign one to
          an agent from its settings. The built-in gateway is always available.
        </p>
      </div>

      {fetching && adapters.length === 0 ? (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      ) : adapters.length === 0 ? (
        <EmptyState
          icon={<Boxes className="h-8 w-8" />}
          title="No adapters installed"
          description="Provider adapters appear here once installed."
        />
      ) : (
        <div className="space-y-2">
          {adapters.map((a) => (
            <Card key={a.type} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{a.displayName}</span>
                  {a.builtIn && <Badge variant="blue">Built-in</Badge>}
                  <Badge variant={a.enabled ? "green" : "gray"}>
                    {a.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <code className="rounded bg-muted px-1.5 py-0.5">{a.type}</code>
                  <span>transport: {a.transport}</span>
                  <span>auth: {a.authKind}</span>
                  <span>v{a.version}</span>
                  <span>
                    {a.modelProfiles.length} model{a.modelProfiles.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
              <Button
                variant={a.enabled ? "secondary" : "primary"}
                size="sm"
                disabled={busy === a.type || (a.builtIn && a.enabled)}
                loading={busy === a.type}
                onClick={() => toggle(a)}
                title={
                  a.builtIn && a.enabled ? "The built-in adapter cannot be disabled" : undefined
                }
              >
                {a.enabled ? "Disable" : "Enable"}
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
