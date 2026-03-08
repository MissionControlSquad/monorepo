import { FeatureGate } from "@/components/common/FeatureGate";
import { FLAG_KEYS } from "@/lib/feature-flag-keys";
import { RecurringTasksPage } from "@/views/RecurringTasksPage";

export default function RecurringTasks() {
  return (
    <FeatureGate flag={FLAG_KEYS.RECURRING_TASKS} featureName="Recurring Tasks">
      <RecurringTasksPage />
    </FeatureGate>
  );
}
