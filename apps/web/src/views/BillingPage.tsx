"use client";

import { useRouter } from "next/navigation";
import { CreditCard, ExternalLink, ReceiptText, Sparkles, Users, Wallet } from "lucide-react";
import {
  SubscriptionContextProvider,
  useBillingPortal,
  useCreditBalance,
  useInvoices,
  useSaaSAuth,
  useSaaSWorkspaces,
  useSeatStatus,
  useSubscriptionManagement,
  useTrialStatus,
  WhenNoSubscription,
  WhenSubscription,
} from "@buildbase/sdk/react";
import { useBuildbaseReady } from "@/components/providers/BuildbaseProvider";
import {
  Badge,
  Breadcrumbs,
  Button,
  Card,
  EmptyState,
  PageLayout,
  Spinner,
  Tooltip,
} from "@/components/ui";
import {
  creditsSummary,
  formatMoney,
  formatUnixDate,
  invoiceStatusLabel,
  seatSummary,
  subscriptionStatusLabel,
  trialSummary,
  type StatusTone,
} from "@/lib/buildbase-billing";

/**
 * Buildbase CUSTOMER billing page (Epic — buildbase auth/billing).
 *
 * Composes the buildbase SDK subscription/seat/trial/invoice/credit hooks into one account page.
 * COEXISTENCE: reached under the (dashboard) group, which is already gated behind the app's own
 * admin auth + license. This page adds the buildbase *customer* billing surface on top; it does NOT
 * replace the admin login. When buildbase is not configured it degrades to an empty state (no
 * crash) because `useBuildbaseReady()` is false and no SDK hook is called.
 *
 * NOT the AI-agent finance/budgets ledger (finance.prisma) — that is a separate concern and is not
 * touched here.
 */

const TONE_TO_VARIANT: Record<StatusTone, "green" | "yellow" | "red" | "gray"> = {
  success: "green",
  warning: "yellow",
  danger: "red",
  muted: "gray",
};

function StatusBadge({ status }: { status?: string | null }) {
  const { label, tone } = subscriptionStatusLabel(status);
  return <Badge variant={TONE_TO_VARIANT[tone]}>{label}</Badge>;
}

function BillingHeader() {
  return (
    <div className="space-y-1">
      <Breadcrumbs items={[{ label: "Billing" }]} />
      <h1 className="text-xl font-semibold text-foreground">Billing &amp; subscription</h1>
      <p className="text-sm text-muted-foreground">
        Your workspace plan, seats, credits and invoices — managed through buildbase.
      </p>
    </div>
  );
}

function PlanCard({ workspaceId, workspace }: { workspaceId: string; workspace: unknown }) {
  const { subscription, loading, error } = useSubscriptionManagement(workspaceId);
  const trial = useTrialStatus();
  const seat = useSeatStatus(
    (workspace ?? null) as { users?: unknown[]; billingCurrency?: string | null } | null,
  );
  const { openBillingPortal, loading: portalLoading } = useBillingPortal(workspaceId);
  const { openPlanPicker } = useSaaSAuth();
  const router = useRouter();

  const sub = subscription?.subscription ?? null;
  const plan = sub?.plan ?? subscription?.plan ?? null;
  const planName = plan?.name ?? "—";
  const trialLine = trialSummary(trial);
  const seatLine = seatSummary(seat);

  async function manageBilling() {
    try {
      const { url } = await openBillingPortal(window.location.href);
      if (url) window.location.href = url;
    } catch {
      /* dormant / not provisioned — no-op */
    }
  }

  return (
    <Card padding="lg" className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-base font-semibold text-foreground">Current plan</h2>
        </div>
        {loading ? <Spinner /> : <StatusBadge status={sub?.subscriptionStatus} />}
      </div>

      <WhenSubscription>
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <Tooltip content="The plan this workspace is currently subscribed to.">
              <span className="text-lg font-semibold text-foreground">{planName}</span>
            </Tooltip>
            {sub?.cancelAtPeriodEnd ? <Badge variant="yellow">Cancels at period end</Badge> : null}
          </div>

          {trialLine ? (
            <Tooltip content="Free-trial period. You will not be charged until it ends.">
              <p className="text-sm text-warning">{trialLine}</p>
            </Tooltip>
          ) : null}

          {seatLine ? (
            <Tooltip content="Seat usage for this workspace. Billable seats are members beyond those included in the plan.">
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Users className="h-4 w-4" aria-hidden="true" />
                {seatLine}
              </p>
            </Tooltip>
          ) : null}

          {sub?.stripeCurrentPeriodEnd ? (
            <p className="text-xs text-muted-foreground">
              Renews{" "}
              {formatUnixDate(Math.floor(new Date(sub.stripeCurrentPeriodEnd).getTime() / 1000))}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-1">
            <Tooltip content="Open the Stripe customer portal to update payment methods, download invoices or cancel.">
              <Button
                variant="secondary"
                size="sm"
                disabled={portalLoading}
                onClick={() => void manageBilling()}
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Manage billing
              </Button>
            </Tooltip>
            <Tooltip content="Switch to a different plan.">
              <Button variant="ghost" size="sm" onClick={() => openPlanPicker()}>
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Change plan
              </Button>
            </Tooltip>
          </div>
        </div>
      </WhenSubscription>

      <WhenNoSubscription>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This workspace has no active subscription. Choose a plan to unlock paid features.
          </p>
          {error ? <p className="text-xs text-muted-foreground">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={() => router.push("/pricing")}>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              View plans
            </Button>
            <Tooltip content="Pick a plan directly in buildbase.">
              <Button variant="ghost" size="sm" onClick={() => openPlanPicker()}>
                Choose a plan
              </Button>
            </Tooltip>
          </div>
        </div>
      </WhenNoSubscription>
    </Card>
  );
}

function CreditsCard({ workspaceId }: { workspaceId: string }) {
  const { balance, loading } = useCreditBalance(workspaceId);
  const { openCreditStore } = useSaaSAuth();
  return (
    <Card padding="lg" className="space-y-4">
      <div className="flex items-center gap-2">
        <Wallet className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-base font-semibold text-foreground">Credits</h2>
      </div>
      <Tooltip content="Prepaid credits are consumed by usage-metered features in this workspace.">
        <p className="text-sm text-muted-foreground">
          {loading ? "Loading credit balance…" : creditsSummary(balance?.available)}
        </p>
      </Tooltip>
      <Button variant="secondary" size="sm" onClick={() => openCreditStore()}>
        <Wallet className="h-4 w-4" aria-hidden="true" />
        Buy credits
      </Button>
    </Card>
  );
}

function InvoicesCard({ workspaceId }: { workspaceId: string }) {
  const { invoices, loading, hasMore } = useInvoices(workspaceId, 10);
  return (
    <Card padding="lg" className="space-y-4">
      <div className="flex items-center gap-2">
        <ReceiptText className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-base font-semibold text-foreground">Invoices</h2>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading invoices…</p>
      ) : invoices.length === 0 ? (
        <EmptyState
          icon={<ReceiptText className="h-5 w-5 text-muted-foreground" />}
          title="No invoices yet"
          description="Invoices will appear here once you are billed."
        />
      ) : (
        <ul className="divide-y divide-border">
          {invoices.map((inv) => {
            const st = invoiceStatusLabel(inv.status);
            return (
              <li key={inv.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {inv.number ?? inv.description ?? inv.id}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatUnixDate(inv.created)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm tabular-nums text-foreground">
                    {formatMoney(inv.amount_due, inv.currency)}
                  </span>
                  <Badge variant={TONE_TO_VARIANT[st.tone]}>{st.label}</Badge>
                  {inv.hosted_invoice_url ? (
                    <a
                      href={inv.hosted_invoice_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="View invoice"
                    >
                      <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })}
          {hasMore ? (
            <li className="pt-2 text-xs text-muted-foreground">
              Older invoices are available in the billing portal.
            </li>
          ) : null}
        </ul>
      )}
    </Card>
  );
}

function BillingContent() {
  const { currentWorkspace } = useSaaSWorkspaces();
  const workspaceId = currentWorkspace?._id ?? null;

  if (!workspaceId) {
    return (
      <EmptyState
        icon={<CreditCard className="h-5 w-5 text-muted-foreground" />}
        title="No workspace selected"
        description="Select or create a workspace to view its billing details."
      />
    );
  }

  return (
    <SubscriptionContextProvider>
      <div className="grid gap-6">
        <PlanCard workspaceId={workspaceId} workspace={currentWorkspace} />
        <div className="grid gap-6 @2xl:grid-cols-2">
          <CreditsCard workspaceId={workspaceId} />
          <InvoicesCard workspaceId={workspaceId} />
        </div>
      </div>
    </SubscriptionContextProvider>
  );
}

export function BillingPage() {
  const ready = useBuildbaseReady();
  return (
    <PageLayout maxWidth="medium">
      <BillingHeader />
      {ready ? (
        <BillingContent />
      ) : (
        <EmptyState
          icon={<CreditCard className="h-5 w-5 text-muted-foreground" />}
          title="Billing is not configured"
          description="Workspace billing is handled by buildbase. Once an organization is provisioned (buildbase org + Stripe + published plans), your subscription, seats, credits and invoices will appear here."
        />
      )}
    </PageLayout>
  );
}
