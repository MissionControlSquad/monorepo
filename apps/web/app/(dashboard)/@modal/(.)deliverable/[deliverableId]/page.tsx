import { DeliverableModalRoute } from "@/components/task/DeliverableModalRoute";

export default async function InterceptedDeliverableModal({
  params,
}: {
  params: Promise<{ deliverableId: string }>;
}) {
  const { deliverableId } = await params;
  return <DeliverableModalRoute deliverableId={deliverableId} />;
}
