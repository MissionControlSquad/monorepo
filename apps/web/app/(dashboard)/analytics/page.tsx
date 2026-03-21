import { FeatureGate } from "@/components/common/FeatureGate";
import { FLAG_KEYS } from "@agentcenter/utils";
import { AnalyticsPage } from "@/views/AnalyticsPage";

export default function Analytics() {
  return (
    <FeatureGate flag={FLAG_KEYS.ANALYTICS} featureName="Analytics">
      <AnalyticsPage />
    </FeatureGate>
  );
}
