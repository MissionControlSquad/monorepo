import { ActivityFeed } from "../../../src/components/layout/ActivityFeed";
import { Breadcrumbs } from "@/components/ui";

export default function ActivityPage() {
  return (
    <div className="flex-1 w-full overflow-hidden flex flex-col">
      <div className="flex-shrink-0 px-4 pt-4">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Activity" }]} />
      </div>
      <ActivityFeed />
    </div>
  );
}
