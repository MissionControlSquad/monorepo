"use client";

import { Check, Sparkles } from "lucide-react";
import {
  formatCents,
  getBasePriceCents,
  PricingPage,
  type IPublicPlanItem,
  type IPublicPlanVersion,
} from "@buildbase/sdk/react";
import { useBuildbaseReady } from "@/components/providers/BuildbaseProvider";
import { Badge, Button, Card, EmptyState, PageLayout, Spinner } from "@/components/ui";

/**
 * PUBLIC pricing page (Epic — buildbase auth/billing). Renders the buildbase SDK `<PricingPage>`
 * for prospective upgrades. It is intentionally public (outside the admin-gated dashboard group)
 * and coexists with the app's own admin login.
 *
 * Dormant-safe: `<PricingPage>` needs the SaaSOSProvider (only mounted when buildbase is
 * configured), so when `useBuildbaseReady()` is false we render a harmless placeholder instead of
 * invoking SDK hooks with no provider.
 *
 * The plan group slug is configurable; buildbase's canonical default is "main-pricing".
 */

const PRICING_SLUG = process.env.NEXT_PUBLIC_SAAS_PRICING_SLUG || "main-pricing";
// Public pricing is shown for a single default currency/interval; the authenticated plan picker
// handles multi-currency / multi-interval selection.
const DISPLAY_CURRENCY = (process.env.NEXT_PUBLIC_SAAS_PRICING_CURRENCY || "usd").toLowerCase();

function priceLabel(plan: IPublicPlanVersion): string {
  if (plan.isFreemium) return "Free";
  // getBasePriceCents is typed for IPlanVersion; the public variant carries the same pricingVariants.
  const cents = getBasePriceCents(plan as never, DISPLAY_CURRENCY, "monthly");
  if (cents == null) return "Custom";
  return `${formatCents(cents, DISPLAY_CURRENCY)}/mo`;
}

function PlanCard({
  plan,
  items,
  onSelect,
}: {
  plan: IPublicPlanVersion;
  items: IPublicPlanItem[];
  onSelect: () => void;
}) {
  const features = items.filter((it) => it.type === "feature" && plan.features?.[it.slug]);
  return (
    <Card padding="lg" className="flex flex-col gap-4">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-foreground">{plan.name}</h3>
          {plan.isFreemium ? <Badge variant="gray">Free</Badge> : null}
        </div>
        <p className="text-2xl font-semibold text-foreground">{priceLabel(plan)}</p>
        {plan.trial?.enabled ? (
          <p className="text-xs text-muted-foreground">{plan.trial.durationDays}-day free trial</p>
        ) : null}
      </div>

      {features.length > 0 ? (
        <ul className="flex-1 space-y-1.5">
          {features.map((f) => (
            <li key={f._id} className="flex items-start gap-2 text-sm text-muted-foreground">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
              <span>{f.name}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex-1" />
      )}

      <Button variant="primary" size="sm" onClick={onSelect} className="w-full justify-center">
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        Get started
      </Button>
    </Card>
  );
}

function PricingGrid() {
  const redirectBaseUrl = typeof window !== "undefined" ? window.location.origin : undefined;
  return (
    <PricingPage
      slug={PRICING_SLUG}
      redirectBaseUrl={redirectBaseUrl ? `${redirectBaseUrl}/billing` : undefined}
      loadingFallback={
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6 text-muted-foreground" />
        </div>
      }
      errorFallback={(error) => (
        <EmptyState
          icon={<Sparkles className="h-5 w-5 text-muted-foreground" />}
          title="Pricing is unavailable"
          description={error}
        />
      )}
    >
      {({ loading, error, items, plans, selectPlan }) => {
        if (loading)
          return (
            <div className="flex justify-center py-12">
              <Spinner className="h-6 w-6 text-muted-foreground" />
            </div>
          );
        if (error)
          return (
            <EmptyState
              icon={<Sparkles className="h-5 w-5 text-muted-foreground" />}
              title="Pricing is unavailable"
              description={error}
            />
          );
        if (plans.length === 0)
          return (
            <EmptyState
              icon={<Sparkles className="h-5 w-5 text-muted-foreground" />}
              title="No plans published"
              description="Plans will appear here once they are published in buildbase."
            />
          );
        return (
          <div className="grid gap-6 @xl:grid-cols-2 @4xl:grid-cols-3">
            {plans.map((plan) => (
              <PlanCard
                key={plan._id}
                plan={plan}
                items={items}
                onSelect={() => selectPlan(plan._id, "monthly", DISPLAY_CURRENCY)}
              />
            ))}
          </div>
        );
      }}
    </PricingPage>
  );
}

export function PricingView() {
  const ready = useBuildbaseReady();
  return (
    <PageLayout maxWidth="wide">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold text-foreground">Plans &amp; pricing</h1>
        <p className="text-sm text-muted-foreground">Choose the plan that fits your workspace.</p>
      </div>
      {ready ? (
        <PricingGrid />
      ) : (
        <EmptyState
          icon={<Sparkles className="h-5 w-5 text-muted-foreground" />}
          title="Pricing is not available yet"
          description="Plans are managed by buildbase and will be shown here once an organization is provisioned and plans are published."
        />
      )}
    </PageLayout>
  );
}
