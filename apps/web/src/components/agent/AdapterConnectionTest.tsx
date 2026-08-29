"use client";

import { useState } from "react";
import { useQuery } from "urql";
import { CheckCircle2, XCircle, PlugZap, AlertTriangle } from "lucide-react";
import { Button, Spinner, Tooltip } from "@/components/ui";

// "Test connection" preflight for a runtime adapter (Paperclip parity). Admin-only + MULTI_PROVIDER_ADAPTERS
// gated on the server; the button simply surfaces the result. Renders loading / error / empty / success
// states and per-check green/red rows, each explaining what it verified.

const PREFLIGHT_QUERY = `
  query ($key: String!) {
    testAdapterEnvironment(key: $key) {
      ok
      errorFamily
      checks { name ok detail }
    }
  }
`;

interface PreflightCheck {
  name: string;
  ok: boolean;
  detail: string | null;
}
interface PreflightResult {
  ok: boolean;
  errorFamily: string | null;
  checks: PreflightCheck[];
}

const TOOLTIP_TEXT =
  "Checks the runtime CLI is installed, reachable, and authenticated before running a task.";

export function AdapterConnectionTest({ adapterKey }: { adapterKey: string }) {
  const [started, setStarted] = useState(false);
  const [{ data, fetching, error }, reExecute] = useQuery<{
    testAdapterEnvironment: PreflightResult;
  }>({
    query: PREFLIGHT_QUERY,
    variables: { key: adapterKey },
    pause: true,
  });

  function run() {
    setStarted(true);
    reExecute({ requestPolicy: "network-only" });
  }

  const result = data?.testAdapterEnvironment;
  const errorMessage = error?.graphQLErrors?.[0]?.message ?? error?.message ?? null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Tooltip content={TOOLTIP_TEXT}>
          <Button
            variant="secondary"
            size="sm"
            icon={<PlugZap className="h-4 w-4" />}
            loading={fetching}
            disabled={fetching}
            onClick={run}
            aria-label={`Test connection — ${TOOLTIP_TEXT}`}
          >
            Test connection
          </Button>
        </Tooltip>
      </div>
      <p className="text-xs text-muted-foreground">
        Runs a preflight: is the runtime CLI installed, reachable, and authenticated on this host?
      </p>

      {/* Loading */}
      {fetching && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Spinner className="h-4 w-4" />
          <span>Testing {adapterKey}…</span>
        </div>
      )}

      {/* Error (transport / gate) */}
      {!fetching && started && errorMessage && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{errorMessage.replace(/^\[GraphQL\]\s*/, "")}</span>
        </div>
      )}

      {/* Success / result */}
      {!fetching && started && !errorMessage && result && (
        <div className="space-y-2 rounded-md border border-border bg-card px-3 py-2.5">
          <div className="flex items-center gap-2 text-sm font-medium">
            {result.ok ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-foreground">Connection looks good</span>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-destructive" />
                <span className="text-foreground">Preflight found problems</span>
              </>
            )}
            {result.errorFamily && (
              <span className="ml-auto rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {result.errorFamily}
              </span>
            )}
          </div>
          <ul className="space-y-1.5">
            {result.checks.map((c) => (
              <li key={c.name} className="flex items-start gap-2 text-xs">
                {c.ok ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                )}
                <span className="min-w-0">
                  <span className="font-medium text-foreground">{c.name}</span>
                  {c.detail && <span className="text-muted-foreground"> — {c.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
