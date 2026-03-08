import { TaskModalRoute } from "@/components/task/TaskModalRoute";

export default async function InterceptedTaskModal({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  return <TaskModalRoute taskParam={taskId} />;
}
