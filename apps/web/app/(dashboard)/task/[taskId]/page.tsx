import { TaskFullPage } from "@/components/task/TaskFullPage";

export default async function TaskPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  return <TaskFullPage taskParam={taskId} />;
}
