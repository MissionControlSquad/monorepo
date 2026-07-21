import { FeatureGate } from "@/components/common/FeatureGate";
import { FLAG_KEYS } from "@agentcenter/utils";
import { ReviewInboxPage } from "@/views/ReviewInboxPage";

export default function Review() {
  return (
    <FeatureGate flag={FLAG_KEYS.GOVERNANCE} featureName="Needs my review">
      <ReviewInboxPage />
    </FeatureGate>
  );
}
