import { ApprovalDetailPage } from "@/views/ApprovalDetailPage";

export default async function ApprovalDetail({
  params,
}: {
  params: Promise<{ approvalId: string }>;
}) {
  const { approvalId } = await params;
  return <ApprovalDetailPage approvalId={approvalId} />;
}
