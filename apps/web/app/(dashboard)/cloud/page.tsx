import { FeatureGate } from "@/components/common/FeatureGate";
import { FLAG_KEYS } from "@agentcenter/utils";
import { CloudPage } from "@/views/CloudPage";

export default function Cloud() {
  return (
    <FeatureGate flag={FLAG_KEYS.CLOUD_VMS} featureName="Cloud VMs">
      <CloudPage />
    </FeatureGate>
  );
}
