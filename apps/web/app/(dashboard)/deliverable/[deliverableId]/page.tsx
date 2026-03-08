import { DeliverableFullPage } from "@/components/task/DeliverableFullPage";

export default async function DeliverablePage({
  params,
}: {
  params: Promise<{ deliverableId: string }>;
}) {
  const { deliverableId } = await params;
  return <DeliverableFullPage deliverableId={deliverableId} />;
}
