import { FeatureGate } from "@/components/common/FeatureGate";
import { FLAG_KEYS } from "@/lib/feature-flag-keys";
import { AnalyticsPage } from "@/views/AnalyticsPage";

export default function Analytics() {
  return (
    <FeatureGate flag={FLAG_KEYS.ANALYTICS} featureName="Analytics">
      <AnalyticsPage />
    </FeatureGate>
  );
}
