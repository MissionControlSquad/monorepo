import { FeatureGate } from "@/components/common/FeatureGate";
import { FLAG_KEYS } from "@agentcenter/utils";
import { CloudVMDetailPage } from "@/views/CloudVMDetailPage";

export default async function CloudVMDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <FeatureGate flag={FLAG_KEYS.CLOUD_VMS} featureName="Cloud VMs">
      <CloudVMDetailPage vmId={id} />
    </FeatureGate>
  );
}
