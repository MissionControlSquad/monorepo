"use client";

import { useQuery } from "urql";
import { Loader2, AlertCircle } from "lucide-react";
import { PROFILE_ANALYTICS_QUERY } from "@/lib/graphql/queries";
import { Breadcrumbs, Card, Badge, PageLayout } from "@/components/ui";

// Per-member analytics dashboard — read-only productivity + cost for a profile. App-data only.

interface CostByModel {
  model: string;
  tokensIn: number;
  tokensOut: number;
  spendCents: number;
}
interface Analytics {
  profileId: string;
  displayName: string;
  kind: string;
  agentId: string | null;
  tasksAssigned: number;
  tasksCompleted: number;
  completionRate: number;
  tasksCreated: number;
  activityCount: number;
  cost: {
    totalTokensIn: number;
    totalTokensOut: number;
    totalSpendCents: number;
    byModel: CostByModel[];
  };
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card padding="lg" className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold text-foreground">{value}</p>
    </Card>
  );
}

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function ProfileAnalyticsPage({ profileId }: { profileId: string }) {
  const [{ data, fetching }] = useQuery<{ profileAnalytics: Analytics | null }>({
    query: PROFILE_ANALYTICS_QUERY,
    variables: { profileId },
  });
  const a = data?.profileAnalytics;

  if (fetching && !a) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!a) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm font-medium">No analytics available for this profile.</p>
      </div>
    );
  }

  return (
    <PageLayout maxWidth="wide">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Agents", href: "/agents" },
          { label: a.displayName },
        ]}
      />

      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold text-foreground">{a.displayName}</h1>
        <Badge variant="gray">{a.kind}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Completion" value={`${Math.round(a.completionRate * 100)}%`} />
        <Stat label="Tasks assigned" value={a.tasksAssigned} />
        <Stat label="Tasks completed" value={a.tasksCompleted} />
        <Stat label="Tasks created" value={a.tasksCreated} />
        <Stat label="Activity events" value={a.activityCount} />
        <Stat label="Spend" value={usd(a.cost.totalSpendCents)} />
        <Stat label="Tokens in" value={a.cost.totalTokensIn.toLocaleString()} />
        <Stat label="Tokens out" value={a.cost.totalTokensOut.toLocaleString()} />
      </div>

      <Card padding="lg" className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Cost by model</h2>
        {a.cost.byModel.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No cost recorded{a.agentId ? "" : " — this profile is not an agent"}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-1.5 pr-4 font-medium">Model</th>
                  <th className="py-1.5 pr-4 font-medium">Tokens in</th>
                  <th className="py-1.5 pr-4 font-medium">Tokens out</th>
                  <th className="py-1.5 font-medium">Spend</th>
                </tr>
              </thead>
              <tbody>
                {a.cost.byModel.map((m) => (
                  <tr key={m.model} className="border-b border-border/50">
                    <td className="py-1.5 pr-4 font-medium text-foreground">{m.model}</td>
                    <td className="py-1.5 pr-4 text-muted-foreground">
                      {m.tokensIn.toLocaleString()}
                    </td>
                    <td className="py-1.5 pr-4 text-muted-foreground">
                      {m.tokensOut.toLocaleString()}
                    </td>
                    <td className="py-1.5 text-foreground">{usd(m.spendCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageLayout>
  );
}
