import { RoutineDetailPage } from "@/views/RoutineDetailPage";

export default async function RoutineDetail({
  params,
}: {
  params: Promise<{ routineId: string }>;
}) {
  const { routineId } = await params;
  return <RoutineDetailPage routineId={routineId} />;
}
