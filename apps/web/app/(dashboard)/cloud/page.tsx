import { FeatureGate } from "@/components/common/FeatureGate";
import { FLAG_KEYS } from "@/lib/feature-flag-keys";
import { CloudPage } from "@/views/CloudPage";

export default function Cloud() {
  return (
    <FeatureGate flag={FLAG_KEYS.CLOUD_VMS} featureName="Cloud VMs">
      <CloudPage />
    </FeatureGate>
  );
}
