import { FeatureGate } from "@/components/common/FeatureGate";
import { FLAG_KEYS } from "@agentcenter/utils";
import { RecurringTasksPage } from "@/views/RecurringTasksPage";

export default function RecurringTasks() {
  return (
    <FeatureGate flag={FLAG_KEYS.RECURRING_TASKS} featureName="Recurring Tasks">
      <RecurringTasksPage />
    </FeatureGate>
  );
}
