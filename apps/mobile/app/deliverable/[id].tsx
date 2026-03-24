import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Linking,
  Platform,
  Image,
  useWindowDimensions,
  Modal,
  FlatList,
  Pressable,
} from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useQuery } from "urql";
import { useEffect, useState } from "react";
import { DELIVERABLE_QUERY, DELIVERABLE_VERSIONS_QUERY } from "@agentcenter/graphql-client";
import { DEFAULT_COLOR, formatDateWithTime, formatDate, formatFileSize, DELIVERABLE_KIND_HEX_COLORS, DELIVERABLE_KIND_ICONS } from "@agentcenter/utils";
import { SimpleMarkdown } from "../../src/components/SimpleMarkdown";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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

interface DeliverableVersion {
  id: string;
  version: number;
  title: string;
  kind: string;
  content: string | null;
  language: string | null;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  url: string | null;
  createdAt: string;
  editedByProfile: { id: string; displayName: string; username: string } | null;
}

const KIND_COLORS = DELIVERABLE_KIND_HEX_COLORS;
const KIND_ICONS = DELIVERABLE_KIND_ICONS;

const IMAGE_MIMES = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp", "image/svg+xml"];

function isImageMime(mimeType: string | null): boolean {
  return IMAGE_MIMES.includes(mimeType ?? "");
}

// ── Content renderer (shared between current and version preview) ─────────────

function DeliverableContent({
  kind,
  content,
  url,
  language,
  mimeType,
  width,
}: {
  kind: string;
  content: string | null;
  url: string | null;
  language: string | null;
  mimeType: string | null;
  width: number;
}) {
  if (kind === "link" && url) {
    return (
      <View style={styles.contentCard}>
        <Text style={styles.sectionLabel}>URL</Text>
        <TouchableOpacity onPress={() => Linking.openURL(url)} activeOpacity={0.7}>
          <Text style={styles.linkText}>{url}</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (kind === "code" && content) {
    return (
      <View style={styles.contentCard}>
        <Text style={styles.sectionLabel}>
          Code{language ? ` · ${language}` : ""}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <Text style={styles.codeText}>{content}</Text>
        </ScrollView>
      </View>
    );
  }
  if (kind === "markdown" && content) {
    return (
      <View style={styles.contentCard}>
        <Text style={styles.sectionLabel}>Content</Text>
        <SimpleMarkdown content={content} />
      </View>
    );
  }
  if (kind === "file" && url && isImageMime(mimeType)) {
    return (
      <View style={styles.contentCard}>
        <Text style={styles.sectionLabel}>Preview</Text>
        <Image
          source={{ uri: url }}
          style={{ width: width - 64, height: (width - 64) * 0.6, borderRadius: 8 }}
          resizeMode="contain"
        />
        <TouchableOpacity
          style={[styles.downloadBtn, { marginTop: 8 }]}
          onPress={() => Linking.openURL(url)}
          activeOpacity={0.7}
        >
          <Text style={styles.downloadBtnText}>📥 Open Full Image</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (url) {
    return (
      <View style={styles.contentCard}>
        <TouchableOpacity
          style={styles.downloadBtn}
          onPress={() => Linking.openURL(url)}
          activeOpacity={0.7}
        >
          <Text style={styles.downloadBtnText}>📥 Open / Download File</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (content) {
    return (
      <View style={styles.contentCard}>
        <Text style={styles.sectionLabel}>Content</Text>
        <Text style={styles.markdownText}>{content}</Text>
      </View>
    );
  }
  return null;
}

// ── Version History Modal ─────────────────────────────────────────────────────

function VersionHistoryModal({
  visible,
  deliverableId,
  currentVersion,
  onClose,
  onSelectVersion,
}: {
  visible: boolean;
  deliverableId: string;
  currentVersion: number;
  onClose: () => void;
  onSelectVersion: (version: DeliverableVersion) => void;
}) {
  const insets = useSafeAreaInsets();

  const [result] = useQuery<{ deliverableVersions: DeliverableVersion[] }>({
    query: DELIVERABLE_VERSIONS_QUERY,
    variables: { deliverableId },
    pause: !visible,
    requestPolicy: "cache-and-network",
  });

  const { data, fetching, error } = result;
  const versions = data?.deliverableVersions ?? [];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[vhStyles.container, { paddingTop: insets.top || 16 }]}>
        <View style={vhStyles.header}>
          <Text style={vhStyles.title}>Version History</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={vhStyles.closeBtn}>Done</Text>
          </TouchableOpacity>
        </View>

        {fetching && versions.length === 0 ? (
          <View style={vhStyles.center}>
            <ActivityIndicator size="large" color="#2563eb" />
          </View>
        ) : error && versions.length === 0 ? (
          <View style={vhStyles.center}>
            <Text style={vhStyles.errorText}>Failed to load versions</Text>
          </View>
        ) : versions.length === 0 ? (
          <View style={vhStyles.center}>
            <Text style={vhStyles.emptyText}>No version history yet</Text>
          </View>
        ) : (
          <FlatList
            data={versions}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[vhStyles.list, { paddingBottom: insets.bottom + 16 }]}
            ItemSeparatorComponent={() => <View style={vhStyles.separator} />}
            renderItem={({ item }) => {
              const isCurrent = item.version === currentVersion;
              return (
                <TouchableOpacity
                  style={vhStyles.versionRow}
                  onPress={() => {
                    onSelectVersion(item);
                    onClose();
                  }}
                  activeOpacity={0.7}
                  disabled={isCurrent}
                >
                  <View style={vhStyles.versionLeft}>
                    <View style={vhStyles.versionNumRow}>
                      <Text style={vhStyles.versionNum}>v{item.version}</Text>
                      {isCurrent && (
                        <View style={vhStyles.currentBadge}>
                          <Text style={vhStyles.currentBadgeText}>Current</Text>
                        </View>
                      )}
                    </View>
                    <Text style={vhStyles.versionDate}>{formatDate(item.createdAt)}</Text>
                    {item.editedByProfile && (
                      <Text style={vhStyles.versionAuthor}>by {item.editedByProfile.displayName}</Text>
                    )}
                    {item.title !== undefined && item.title && (
                      <Text style={vhStyles.versionTitle} numberOfLines={1}>{item.title}</Text>
                    )}
                  </View>
                  {!isCurrent && (
                    <Text style={vhStyles.viewBtn}>View →</Text>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

const vhStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  title: { fontSize: 17, fontWeight: "700", color: "#111827" },
  closeBtn: { fontSize: 16, color: "#2563eb", fontWeight: "600" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  errorText: { color: "#dc2626", fontSize: 15 },
  emptyText: { color: "#9ca3af", fontSize: 15 },
  list: { padding: 16, gap: 0 },
  separator: { height: 1, backgroundColor: "#f3f4f6" },
  versionRow: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 0,
  },
  versionLeft: { flex: 1, gap: 2 },
  versionNumRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  versionNum: { fontSize: 15, fontWeight: "700", color: "#111827" },
  currentBadge: {
    backgroundColor: "#dbeafe",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  currentBadgeText: { fontSize: 11, color: "#2563eb", fontWeight: "600" },
  versionDate: { fontSize: 12, color: "#6b7280" },
  versionAuthor: { fontSize: 12, color: "#9ca3af" },
  versionTitle: { fontSize: 13, color: "#374151", marginTop: 2 },
  viewBtn: { fontSize: 14, color: "#2563eb", fontWeight: "600", marginLeft: 12 },
});

// ── Version Preview Modal ─────────────────────────────────────────────────────

function VersionPreviewModal({
  visible,
  version,
  onClose,
}: {
  visible: boolean;
  version: DeliverableVersion | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  if (!version) return null;

  const kindColor = KIND_COLORS[version.kind] ?? DEFAULT_COLOR;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[vpStyles.container, { paddingTop: insets.top || 16 }]}>
        <View style={vpStyles.header}>
          <View style={{ flex: 1 }}>
            <Text style={vpStyles.title} numberOfLines={1}>{version.title}</Text>
            <Text style={vpStyles.subtitle}>Version {version.version} · {formatDate(version.createdAt)}</Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={vpStyles.closeBtn}>Done</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={[vpStyles.content, { paddingBottom: insets.bottom + 16 }]}
          contentInsetAdjustmentBehavior="automatic"
        >
          <View style={[vpStyles.kindBadge, { backgroundColor: kindColor + "18" }]}>
            <Text style={vpStyles.kindIcon}>{KIND_ICONS[version.kind] ?? "📄"}</Text>
            <Text style={[vpStyles.kindText, { color: kindColor }]}>
              {version.kind} · v{version.version}
            </Text>
          </View>

          {version.editedByProfile && (
            <View style={vpStyles.metaRow}>
              <Text style={vpStyles.metaKey}>Edited by</Text>
              <Text style={vpStyles.metaValue}>{version.editedByProfile.displayName}</Text>
            </View>
          )}

          <DeliverableContent
            kind={version.kind}
            content={version.content}
            url={version.url}
            language={version.language}
            mimeType={version.mimeType}
            width={width}
          />
        </ScrollView>
      </View>
    </Modal>
  );
}

const vpStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    gap: 12,
  },
  title: { fontSize: 16, fontWeight: "700", color: "#111827" },
  subtitle: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  closeBtn: { fontSize: 16, color: "#2563eb", fontWeight: "600", paddingTop: 2 },
  content: { padding: 16, gap: 12 },
  kindBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: "flex-start",
  },
  kindIcon: { fontSize: 14 },
  kindText: { fontSize: 13, fontWeight: "600", textTransform: "capitalize" },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  metaKey: { fontSize: 13, color: "#6b7280" },
  metaValue: { fontSize: 13, color: "#111827", fontWeight: "500" },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function DeliverableScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();

  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<DeliverableVersion | null>(null);

  const [result] = useQuery<{ deliverable: Deliverable | null }>({
    query: DELIVERABLE_QUERY,
    variables: { id },
    requestPolicy: "cache-and-network",
  });

  const { data, fetching, error } = result;
  const d = data?.deliverable;

  useEffect(() => {
    if (d) {
      navigation.setOptions({
        title: d.title.slice(0, 40),
        headerRight: () => (
          <TouchableOpacity
            onPress={() => setShowVersionHistory(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={{ color: "#2563eb", fontSize: 14, fontWeight: "600" }}>History</Text>
          </TouchableOpacity>
        ),
      });
    }
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

  const kindColor = KIND_COLORS[d.kind] ?? DEFAULT_COLOR;

  return (
    <>
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
          <MetaRow label="Created" value={formatDateWithTime(d.createdAt)} />
          {d.task && (
            <MetaRow label="Task" value={`#${d.task.taskNumber} ${d.task.title}`} />
          )}
          {d.language && <MetaRow label="Language" value={d.language} />}
          {d.fileName && <MetaRow label="File" value={d.fileName} />}
          {d.fileSize && <MetaRow label="Size" value={formatFileSize(d.fileSize)} />}
        </View>

        {/* Version History Button */}
        <TouchableOpacity
          style={styles.historyBtn}
          onPress={() => setShowVersionHistory(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.historyBtnIcon}>🕐</Text>
          <Text style={styles.historyBtnText}>Version History</Text>
          <Text style={styles.historyBtnChevron}>›</Text>
        </TouchableOpacity>

        {/* Content */}
        <DeliverableContent
          kind={d.kind}
          content={d.content}
          url={d.url}
          language={d.language}
          mimeType={d.mimeType}
          width={width}
        />
      </ScrollView>

      <VersionHistoryModal
        visible={showVersionHistory}
        deliverableId={id}
        currentVersion={d.version}
        onClose={() => setShowVersionHistory(false)}
        onSelectVersion={(v) => setPreviewVersion(v)}
      />

      <VersionPreviewModal
        visible={previewVersion !== null}
        version={previewVersion}
        onClose={() => setPreviewVersion(null)}
      />
    </>
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

  historyBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 8,
  },
  historyBtnIcon: { fontSize: 16 },
  historyBtnText: { flex: 1, fontSize: 14, color: "#374151", fontWeight: "500" },
  historyBtnChevron: { fontSize: 18, color: "#9ca3af" },

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
