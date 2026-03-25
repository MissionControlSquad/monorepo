import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Linking,
  Platform,
  Image,
  useWindowDimensions,
  Modal,
  FlatList,
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
      <View className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700 gap-2.5">
        <Text className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-[0.6px]">URL</Text>
        <TouchableOpacity onPress={() => Linking.openURL(url)} activeOpacity={0.7}>
          <Text className="text-sm text-blue-600 dark:text-blue-400 underline">{url}</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (kind === "code" && content) {
    return (
      <View className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700 gap-2.5">
        <Text className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-[0.6px]">
          Code{language ? ` · ${language}` : ""}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <Text
            className="text-sm text-indigo-900 dark:text-indigo-200 bg-violet-50 dark:bg-slate-900 p-3 rounded-lg leading-5"
            style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}
          >
            {content}
          </Text>
        </ScrollView>
      </View>
    );
  }
  if (kind === "markdown" && content) {
    return (
      <View className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700 gap-2.5">
        <Text className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-[0.6px]">Content</Text>
        <SimpleMarkdown content={content} />
      </View>
    );
  }
  if (kind === "file" && url && isImageMime(mimeType)) {
    return (
      <View className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700 gap-2.5">
        <Text className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-[0.6px]">Preview</Text>
        <Image
          source={{ uri: url }}
          style={{ width: width - 64, height: (width - 64) * 0.6, borderRadius: 8 }}
          resizeMode="contain"
        />
        <TouchableOpacity
          className="bg-blue-600 rounded-xl py-3 items-center mt-2"
          onPress={() => Linking.openURL(url)}
          activeOpacity={0.7}
        >
          <Text className="text-white text-base font-semibold">📥 Open Full Image</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (url) {
    return (
      <View className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700">
        <TouchableOpacity
          className="bg-blue-600 rounded-xl py-3 items-center"
          onPress={() => Linking.openURL(url)}
          activeOpacity={0.7}
        >
          <Text className="text-white text-base font-semibold">📥 Open / Download File</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (content) {
    return (
      <View className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700 gap-2.5">
        <Text className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-[0.6px]">Content</Text>
        <Text className="text-base text-gray-700 dark:text-slate-300 leading-6">{content}</Text>
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
      <View className="flex-1 bg-gray-50 dark:bg-slate-900" style={{ paddingTop: insets.top || 16 }}>
        <View className="flex-row justify-between items-center px-4 py-3.5 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
          <Text className="text-lg font-bold text-gray-900 dark:text-slate-100">Version History</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text className="text-base text-blue-600 dark:text-blue-400 font-semibold">Done</Text>
          </TouchableOpacity>
        </View>

        {fetching && versions.length === 0 ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" color="#2563eb" />
          </View>
        ) : error && versions.length === 0 ? (
          <View className="flex-1 justify-center items-center">
            <Text className="text-red-600 dark:text-red-400 text-base">Failed to load versions</Text>
          </View>
        ) : versions.length === 0 ? (
          <View className="flex-1 justify-center items-center">
            <Text className="text-gray-400 dark:text-slate-500 text-base">No version history yet</Text>
          </View>
        ) : (
          <FlatList
            data={versions}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 16 }}
            ItemSeparatorComponent={() => <View className="h-px bg-gray-100 dark:bg-slate-700" />}
            renderItem={({ item }) => {
              const isCurrent = item.version === currentVersion;
              return (
                <TouchableOpacity
                  className="bg-white dark:bg-slate-800 px-4 py-3.5 flex-row items-center justify-between"
                  onPress={() => {
                    onSelectVersion(item);
                    onClose();
                  }}
                  activeOpacity={0.7}
                  disabled={isCurrent}
                >
                  <View className="flex-1 gap-0.5">
                    <View className="flex-row items-center gap-2">
                      <Text className="text-base font-bold text-gray-900 dark:text-slate-100">v{item.version}</Text>
                      {isCurrent && (
                        <View className="bg-blue-100 dark:bg-blue-900/30 rounded-md px-1.5 py-0.5">
                          <Text className="text-xs text-blue-600 dark:text-blue-400 font-semibold">Current</Text>
                        </View>
                      )}
                    </View>
                    <Text className="text-xs text-gray-500 dark:text-slate-400">{formatDate(item.createdAt)}</Text>
                    {item.editedByProfile && (
                      <Text className="text-xs text-gray-400 dark:text-slate-500">by {item.editedByProfile.displayName}</Text>
                    )}
                    {item.title && (
                      <Text className="text-sm text-gray-700 dark:text-slate-300 mt-0.5" numberOfLines={1}>{item.title}</Text>
                    )}
                  </View>
                  {!isCurrent && (
                    <Text className="text-sm text-blue-600 dark:text-blue-400 font-semibold ml-3">View →</Text>
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
      <View className="flex-1 bg-gray-50 dark:bg-slate-900" style={{ paddingTop: insets.top || 16 }}>
        <View className="flex-row justify-between items-start px-4 py-3.5 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 gap-3">
          <View className="flex-1">
            <Text className="text-base font-bold text-gray-900 dark:text-slate-100" numberOfLines={1}>{version.title}</Text>
            <Text className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Version {version.version} · {formatDate(version.createdAt)}</Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text className="text-base text-blue-600 dark:text-blue-400 font-semibold pt-0.5">Done</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 16 }}
          contentInsetAdjustmentBehavior="automatic"
        >
          <View
            className="flex-row items-center gap-1.5 rounded-lg px-2.5 py-1 self-start"
            style={{ backgroundColor: kindColor + "18" }}
          >
            <Text className="text-sm">{KIND_ICONS[version.kind] ?? "📄"}</Text>
            <Text className="text-sm font-semibold capitalize" style={{ color: kindColor }}>
              {version.kind} · v{version.version}
            </Text>
          </View>

          {version.editedByProfile && (
            <View className="flex-row justify-between bg-white dark:bg-slate-800 rounded-xl p-3 border border-gray-200 dark:border-slate-700">
              <Text className="text-sm text-gray-500 dark:text-slate-400">Edited by</Text>
              <Text className="text-sm text-gray-900 dark:text-slate-100 font-medium">{version.editedByProfile.displayName}</Text>
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
      <View className="flex-1 justify-center items-center bg-gray-50 dark:bg-slate-900">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (error || !d) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50 dark:bg-slate-900">
        <Text className="text-base text-red-600 dark:text-red-400">Deliverable not found</Text>
      </View>
    );
  }

  const kindColor = KIND_COLORS[d.kind] ?? DEFAULT_COLOR;

  return (
    <>
      <ScrollView
        className="flex-1 bg-gray-50 dark:bg-slate-900"
        contentContainerStyle={{ padding: 16, gap: 12 }}
        contentInsetAdjustmentBehavior="automatic"
      >
        {/* Kind badge */}
        <View className="flex-row items-center">
          <View
            className="flex-row items-center gap-1.5 rounded-lg px-2.5 py-1"
            style={{ backgroundColor: kindColor + "18" }}
          >
            <Text className="text-sm">{KIND_ICONS[d.kind] ?? "📄"}</Text>
            <Text className="text-sm font-semibold capitalize" style={{ color: kindColor }}>
              {d.kind} · v{d.version}
            </Text>
          </View>
        </View>

        <Text className="text-xl font-bold text-gray-900 dark:text-slate-100 leading-7">{d.title}</Text>

        {/* Meta */}
        <View className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700 gap-2.5">
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
          className="flex-row items-center gap-2 bg-white dark:bg-slate-800 rounded-xl p-3.5 border border-gray-200 dark:border-slate-700"
          onPress={() => setShowVersionHistory(true)}
          activeOpacity={0.7}
        >
          <Text className="text-base">🕐</Text>
          <Text className="flex-1 text-sm text-gray-700 dark:text-slate-300 font-medium">Version History</Text>
          <Text className="text-lg text-gray-400 dark:text-slate-500">›</Text>
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
    <View className="flex-row justify-between gap-3">
      <Text className="text-sm text-gray-500 dark:text-slate-400 w-20">{label}</Text>
      <Text className="text-sm text-gray-900 dark:text-slate-100 flex-1 text-right" numberOfLines={2}>{value}</Text>
    </View>
  );
}
