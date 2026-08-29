"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle, CreditCard } from "lucide-react";
import { Button, Card, PageLayout } from "@/components/ui";
import { readBillingOutcome, type BillingOutcome } from "@/lib/billing-return";

/**
 * PUBLIC post-checkout return page (buildbase billing). The SDK `<PricingPage>` sends the browser to
 * `${origin}/billing` after a Stripe checkout completes or is cancelled (see PricingView
 * `redirectBaseUrl`). Without this route that return 404s. It is intentionally public (checkout can be
 * started by a prospective user from the public /pricing page) and dormant-safe (no SDK hooks — it only
 * reads the return status from the query string, which buildbase appends). Outcome logic lives in
 * `@/lib/billing-return` so it can be unit-tested.
 */

function BillingReturnContent() {
  const params = useSearchParams();
  const outcome = readBillingOutcome(params);

  const copy: Record<
    BillingOutcome,
    { icon: React.ReactNode; title: string; description: string }
  > = {
    success: {
      icon: <CheckCircle2 className="h-8 w-8 text-success" aria-hidden="true" />,
      title: "Subscription updated",
      description:
        "Your plan change was processed. It may take a moment to reflect across your workspace.",
    },
    cancelled: {
      icon: <XCircle className="h-8 w-8 text-muted-foreground" aria-hidden="true" />,
      title: "Checkout cancelled",
      description: "No changes were made to your subscription. You can pick a plan again any time.",
    },
    unknown: {
      icon: <CreditCard className="h-8 w-8 text-muted-foreground" aria-hidden="true" />,
      title: "Returned from checkout",
      description:
        "You've returned from the billing flow. Head to your dashboard to see your current plan and usage.",
    },
  };

  const { icon, title, description } = copy[outcome];

  return (
    <PageLayout maxWidth="narrow">
      <Card padding="lg" className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
        {icon}
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          <Link href="/">
            <Button variant="primary" size="sm" className="w-full justify-center">
              Go to dashboard
            </Button>
          </Link>
          {outcome === "cancelled" ? (
            <Link href="/pricing">
              <Button variant="secondary" size="sm" className="w-full justify-center">
                Back to pricing
              </Button>
            </Link>
          ) : (
            <Link href="/usage">
              <Button variant="secondary" size="sm" className="w-full justify-center">
                View usage
              </Button>
            </Link>
          )}
        </div>
      </Card>
    </PageLayout>
  );
}

export function BillingReturnView() {
  // useSearchParams() requires a Suspense boundary under the app router.
  return (
    <Suspense fallback={<PageLayout maxWidth="narrow">{null}</PageLayout>}>
      <BillingReturnContent />
    </Suspense>
  );
}
