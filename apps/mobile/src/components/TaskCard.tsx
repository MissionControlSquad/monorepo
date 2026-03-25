import { View, Text, TouchableOpacity } from "react-native";
import { StatusPill } from "./StatusPill";
import { PriorityBadge } from "./PriorityBadge";
import { formatDueDate } from "@agentcenter/utils";

interface TaskCardTask {
  id: string;
  title: string;
  taskNumber: number;
  status: string;
  priority: string | null;
  dueDate?: string | null;
  assignees?: { profile: { displayName: string; identityEmoji?: string | null } }[];
  project?: { name: string } | null;
}

interface TaskCardProps {
  task: TaskCardTask;
  onPress: () => void;
}

export function TaskCard({ task, onPress }: TaskCardProps) {
  const isOverdue =
    task.dueDate != null && new Date(task.dueDate).getTime() < Date.now();

  return (
    <TouchableOpacity
      className="bg-white dark:bg-slate-800 rounded-xl p-3.5 border border-gray-200 dark:border-slate-700 gap-2"
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Header row */}
      <View className="flex-row items-center gap-2 flex-wrap">
        <Text className="text-xs text-gray-400 dark:text-slate-500 font-medium">
          #{task.taskNumber}
        </Text>
        {task.priority && <PriorityBadge priority={task.priority} />}
        {task.project && (
          <Text className="text-xs text-gray-500 dark:text-slate-400 flex-1" numberOfLines={1}>
            📁 {task.project.name}
          </Text>
        )}
      </View>

      {/* Title */}
      <Text className="text-sm font-semibold text-gray-900 dark:text-slate-100 leading-5" numberOfLines={2}>
        {task.title}
      </Text>

      {/* Footer */}
      <View className="flex-row items-center justify-between gap-2">
        <StatusPill status={task.status} />
        <View className="flex-row items-center gap-2 flex-1 justify-end">
          {task.dueDate && (
            <Text
              className={`text-xs ${isOverdue ? "text-red-600 dark:text-red-400 font-semibold" : "text-gray-400 dark:text-slate-500"}`}
            >
              {formatDueDate(task.dueDate)}
            </Text>
          )}
          {(task.assignees ?? []).length > 0 && (
            <Text className="text-xs text-gray-400 dark:text-slate-500 max-w-24" numberOfLines={1}>
              {task.assignees![0].profile.displayName}
              {task.assignees!.length > 1 ? ` +${task.assignees!.length - 1}` : ""}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}
