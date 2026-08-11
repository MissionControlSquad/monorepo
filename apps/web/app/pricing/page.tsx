import { PricingView } from "@/views/PricingView";

// PUBLIC pricing route (outside the admin-gated dashboard group) for prospective upgrades.
// Harmless when buildbase is dormant — PricingView renders a placeholder instead of SDK hooks.
export const dynamic = "force-dynamic";

export default function Pricing() {
  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <PricingView />
    </main>
  );
}
