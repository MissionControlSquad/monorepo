import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { StatusPill } from "./StatusPill";
import { PriorityBadge } from "./PriorityBadge";

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

function fmtDueDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const days = Math.ceil(diff / 86400000);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days}d`;
}

export function TaskCard({ task, onPress }: TaskCardProps) {
  const isOverdue =
    task.dueDate != null && new Date(task.dueDate).getTime() < Date.now();

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      {/* Header row */}
      <View style={styles.header}>
        <Text style={styles.taskNum}>#{task.taskNumber}</Text>
        {task.priority && <PriorityBadge priority={task.priority} />}
        {task.project && (
          <Text style={styles.projectTag} numberOfLines={1}>
            📁 {task.project.name}
          </Text>
        )}
      </View>

      {/* Title */}
      <Text style={styles.title} numberOfLines={2}>
        {task.title}
      </Text>

      {/* Footer */}
      <View style={styles.footer}>
        <StatusPill status={task.status} />
        <View style={styles.footerRight}>
          {task.dueDate && (
            <Text style={[styles.dueDate, isOverdue && styles.dueDateOverdue]}>
              {fmtDueDate(task.dueDate)}
            </Text>
          )}
          {(task.assignees ?? []).length > 0 && (
            <Text style={styles.assignee} numberOfLines={1}>
              {task.assignees![0].profile.displayName}
              {task.assignees!.length > 1 ? ` +${task.assignees!.length - 1}` : ""}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  taskNum: {
    fontSize: 12,
    color: "#9ca3af",
    fontWeight: "500",
  },
  projectTag: {
    fontSize: 11,
    color: "#6b7280",
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    lineHeight: 20,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  footerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    justifyContent: "flex-end",
  },
  dueDate: {
    fontSize: 11,
    color: "#9ca3af",
  },
  dueDateOverdue: {
    color: "#dc2626",
    fontWeight: "600",
  },
  assignee: {
    fontSize: 11,
    color: "#9ca3af",
    maxWidth: 100,
  },
});
