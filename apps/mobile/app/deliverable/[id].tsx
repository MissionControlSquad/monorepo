import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Linking,
  Platform,
} from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useQuery } from "urql";
import { useEffect } from "react";
import { DELIVERABLE_QUERY } from "@agentcenter/graphql-client";

interface Deliverable {
  id: string;
  title: string;
  kind: string;
  content: string | null;
  language: string | null;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  url: string | null;
  version: number;
  createdAt: string;
  profile: { id: string; displayName: string; username: string };
  task: { id: string; title: string; taskNumber: number; status: string } | null;
}

const KIND_COLORS: Record<string, string> = {
  markdown: "#2563eb",
  code: "#7c3aed",
  link: "#059669",
  file: "#d97706",
};

const KIND_ICONS: Record<string, string> = {
  markdown: "📄",
  code: "💻",
  link: "🔗",
  file: "📎",
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DeliverableScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();

  const [result] = useQuery<{ deliverable: Deliverable | null }>({
    query: DELIVERABLE_QUERY,
    variables: { id },
    requestPolicy: "cache-and-network",
  });

  const { data, fetching, error } = result;
  const d = data?.deliverable;

  useEffect(() => {
    if (d) navigation.setOptions({ title: d.title.slice(0, 40) });
  }, [d, navigation]);

  if (fetching && !d) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (error || !d) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Deliverable not found</Text>
      </View>
    );
  }

  const kindColor = KIND_COLORS[d.kind] ?? "#6b7280";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.kindBadge, { backgroundColor: kindColor + "18" }]}>
          <Text style={styles.kindIcon}>{KIND_ICONS[d.kind] ?? "📄"}</Text>
          <Text style={[styles.kindText, { color: kindColor }]}>
            {d.kind} · v{d.version}
          </Text>
        </View>
      </View>

      <Text style={styles.title}>{d.title}</Text>

      {/* Meta */}
      <View style={styles.metaCard}>
        <MetaRow label="Author" value={d.profile.displayName} />
        <MetaRow label="Created" value={formatDate(d.createdAt)} />
        {d.task && (
          <MetaRow label="Task" value={`#${d.task.taskNumber} ${d.task.title}`} />
        )}
        {d.language && <MetaRow label="Language" value={d.language} />}
        {d.fileName && <MetaRow label="File" value={d.fileName} />}
        {d.fileSize && <MetaRow label="Size" value={formatFileSize(d.fileSize)} />}
      </View>

      {/* Content */}
      {d.kind === "link" && d.url ? (
        <View style={styles.contentCard}>
          <Text style={styles.sectionLabel}>URL</Text>
          <TouchableOpacity
            onPress={() => Linking.openURL(d.url!)}
            activeOpacity={0.7}
          >
            <Text style={styles.linkText}>{d.url}</Text>
          </TouchableOpacity>
        </View>
      ) : d.kind === "code" && d.content ? (
        <View style={styles.contentCard}>
          <Text style={styles.sectionLabel}>
            Code{d.language ? ` · ${d.language}` : ""}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <Text style={styles.codeText}>{d.content}</Text>
          </ScrollView>
        </View>
      ) : d.content ? (
        <View style={styles.contentCard}>
          <Text style={styles.sectionLabel}>Content</Text>
          <Text style={styles.markdownText}>{d.content}</Text>
        </View>
      ) : d.url ? (
        <View style={styles.contentCard}>
          <TouchableOpacity
            style={styles.downloadBtn}
            onPress={() => Linking.openURL(d.url!)}
            activeOpacity={0.7}
          >
            <Text style={styles.downloadBtnText}>📥 Open / Download File</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </ScrollView>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaKey}>{label}</Text>
      <Text style={styles.metaValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  content: { padding: 16, gap: 12 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f9fafb",
  },
  errorText: { color: "#dc2626", fontSize: 16 },

  header: { flexDirection: "row", alignItems: "center" },
  kindBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  kindIcon: { fontSize: 14 },
  kindText: { fontSize: 13, fontWeight: "600", textTransform: "capitalize" },

  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    lineHeight: 28,
  },

  metaCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 10,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  metaKey: { fontSize: 13, color: "#6b7280", width: 80 },
  metaValue: { fontSize: 13, color: "#111827", flex: 1, textAlign: "right" },

  contentCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  markdownText: {
    fontSize: 15,
    color: "#374151",
    lineHeight: 24,
  },
  codeText: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 13,
    color: "#1e1b4b",
    lineHeight: 20,
    backgroundColor: "#f5f3ff",
    padding: 12,
    borderRadius: 8,
  },
  linkText: {
    fontSize: 14,
    color: "#2563eb",
    textDecorationLine: "underline",
  },
  downloadBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  downloadBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
});

