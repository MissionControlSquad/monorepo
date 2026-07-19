import { CaseDetailPage } from "@/views/CaseDetailPage";

export default async function CaseDetail({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  return <CaseDetailPage caseId={caseId} />;
}
