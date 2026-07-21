import { FeatureGate } from "@/components/common/FeatureGate";
import { FLAG_KEYS } from "@agentcenter/utils";
import { AgentCompaniesPage } from "@/views/AgentCompaniesPage";

export default function Companies() {
  return (
    <FeatureGate flag={FLAG_KEYS.AGENT_COMPANIES} featureName="Agent Companies">
      <AgentCompaniesPage />
    </FeatureGate>
  );
}
