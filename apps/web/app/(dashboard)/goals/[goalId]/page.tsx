import { GoalDetailPage } from "@/views/GoalDetailPage";

export default async function GoalDetail({ params }: { params: Promise<{ goalId: string }> }) {
  const { goalId } = await params;
  return <GoalDetailPage goalId={goalId} />;
}
