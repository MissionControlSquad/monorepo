import { BillingPage } from "@/views/BillingPage";

// buildbase customer billing route. Lives under the (dashboard) group, so it is already gated behind
// the app's admin auth + license. Degrades to an empty state when buildbase is not configured.
export default function Billing() {
  return <BillingPage />;
}
