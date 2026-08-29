import { BillingReturnView } from "@/views/BillingReturnView";

// PUBLIC post-checkout return route (buildbase billing). The SDK `<PricingPage>` redirects here after
// a Stripe checkout completes/cancels (PricingView `redirectBaseUrl`). Kept outside the admin-gated
// dashboard group so a prospective user's checkout return doesn't 404.
export const dynamic = "force-dynamic";

export default function Billing() {
  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <BillingReturnView />
    </main>
  );
}
