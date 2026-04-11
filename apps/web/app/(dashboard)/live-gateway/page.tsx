import { FeatureGate } from "@/components/common/FeatureGate";
import { FLAG_KEYS } from "@agentcenter/utils";
import { LiveGatewayPage } from "@/views/LiveGatewayPage";

export default function LiveGateway() {
  return (
    <FeatureGate flag={FLAG_KEYS.LIVE_GATEWAY} featureName="Live Gateway">
      <LiveGatewayPage />
    </FeatureGate>
  );
}
