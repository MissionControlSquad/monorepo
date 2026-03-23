import { View, Text, TouchableOpacity } from "react-native";
import { StatusPill } from "./StatusPill";
import { PriorityBadge } from "./PriorityBadge";
import { useTheme } from "../hooks/useTheme";
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
  const { colors } = useTheme();
  const isOverdue =
    task.dueDate != null && new Date(task.dueDate).getTime() < Date.now();

  return (
    <TouchableOpacity
      style={{
        backgroundColor: colors.card,
        borderRadius: 12,
        padding: 14,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 8,
      }}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Header row */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Text style={{ fontSize: 12, color: colors.textMuted, fontWeight: "500" }}>
          #{task.taskNumber}
        </Text>
        {task.priority && <PriorityBadge priority={task.priority} />}
        {task.project && (
          <Text style={{ fontSize: 11, color: colors.textSecondary, flex: 1 }} numberOfLines={1}>
            📁 {task.project.name}
          </Text>
        )}
      </View>

      {/* Title */}
      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text, lineHeight: 20 }} numberOfLines={2}>
        {task.title}
      </Text>

      {/* Footer */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <StatusPill status={task.status} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, justifyContent: "flex-end" }}>
          {task.dueDate && (
            <Text style={{ fontSize: 11, color: isOverdue ? colors.danger : colors.textMuted, fontWeight: isOverdue ? "600" : "400" }}>
              {formatDueDate(task.dueDate)}
            </Text>
          )}
          {(task.assignees ?? []).length > 0 && (
            <Text style={{ fontSize: 11, color: colors.textMuted, maxWidth: 100 }} numberOfLines={1}>
              {task.assignees![0].profile.displayName}
              {task.assignees!.length > 1 ? ` +${task.assignees!.length - 1}` : ""}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}
