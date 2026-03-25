import {
  View,
  Text,
  ScrollView,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useQuery, useMutation } from "urql";
import { useEffect, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { SimpleMarkdown } from "../../src/components/SimpleMarkdown";
import {
  PROJECT_QUERY,
  TASKS_BY_PROJECT_QUERY,
  PROJECT_DOCS_BY_PROJECT_QUERY,
  PROJECT_DOC_QUERY,
  PROJECT_DOC_REVISIONS_QUERY,
  UPDATE_PROJECT,
  ARCHIVE_PROJECT,
  RESTORE_PROJECT,
  SET_PROJECT_SHUTDOWN,
  ADD_PROJECT_MEMBER,
  REMOVE_PROJECT_MEMBER,
  CREATE_PROJECT_DOC,
  UPDATE_PROJECT_DOC,
  DELETE_PROJECT_DOC,
  PROFILES_QUERY,
} from "@agentcenter/graphql-client";
import { STATUS_HEX_COLORS, PRIORITY_HEX_COLORS, DEFAULT_COLOR, formatDate } from "@agentcenter/utils";
import { useTheme } from "../../src/hooks/useTheme";
import { TabFilterStrip } from "../../src/components/TabFilterStrip";
import { KanbanBoard } from "../../src/components/KanbanBoard";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProfileMember {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  agentId: string | null;
  agent?: {
    id: string;
    name: string;
    identityEmoji: string | null;
    role: string;
    status: string;
  } | null;
}

interface ProjectMember {
  id: string;
  projectId: string;
  profileId: string;
  joinedAt: string;
  profile: ProfileMember;
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  shutdownActive: boolean;
  createdAt: string;
  updatedAt: string;
  members: ProjectMember[];
}

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  taskNumber: number;
  assignees?: { profile: { displayName: string } }[];
}

interface ProjectDoc {
  id: string;
  projectId: string;
  title: string;
  summary: string | null;
  updatedAt: string;
}

interface ProjectDocFull {
  id: string;
  title: string;
  content: string;
  summary: string | null;
  updatedAt: string;
}

interface DocRevision {
  id: string;
  docId: string;
  title: string;
  summary: string | null;
  content: string;
  editAction: string | null;
  createdAt: string;
  editedBy: { id: string; name: string; identityEmoji: string | null } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────



// ── Tab constants ─────────────────────────────────────────────────────────────

type Tab = "overview" | "tasks" | "members" | "docs";

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ project, onRefresh }: { project: Project; onRefresh: () => void }) {
  const [editMode, setEditMode] = useState(false);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [, updateProject] = useMutation(UPDATE_PROJECT);
  const [saving, setSaving] = useState(false);

  const agents = project.members.filter((m) => m.profile.agentId != null);
  const humans = project.members.filter((m) => m.profile.agentId == null);

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert("Error", "Project name is required");
      return;
    }
    setSaving(true);
    const res = await updateProject({
      id: project.id,
      name: name.trim(),
      description: description.trim() || null,
    });
    setSaving(false);
    if (res.error) {
      Alert.alert("Error", res.error.message);
    } else {
      setEditMode(false);
      onRefresh();
    }
  }

  return (
    <ScrollView
      contentContainerClassName="p-4 gap-3"
    >
      {/* Shutdown banner */}
      {project.shutdownActive && (
        <View className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border border-yellow-200 dark:border-yellow-700 p-3 flex-row items-center gap-2.5">
          <Ionicons name="pause-circle-outline" size={20} color="#d97706" />
          <View className="flex-1">
            <Text className="text-xs font-bold text-yellow-800 dark:text-yellow-200">Project Paused</Text>
            <Text className="text-xs text-yellow-700 dark:text-yellow-300 mt-0.5">New task creation and agent work are blocked.</Text>
          </View>
        </View>
      )}

      {/* Status + Created */}
      <View className="flex-row items-center gap-3">
        <View
          className="px-2.5 py-1 rounded-xl"
          style={{ backgroundColor: STATUS_HEX_COLORS[project.status] ?? DEFAULT_COLOR }}
        >
          <Text className="text-white text-xs font-semibold">{project.status}</Text>
        </View>
        <Text className="text-gray-400 dark:text-slate-500 text-xs">Created {formatDate(project.createdAt)}</Text>
      </View>

      {/* Edit / View name + description */}
      {editMode ? (
        <View className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-blue-600">
          <Text className="text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">Name</Text>
          <TextInput
            className="border border-gray-300 dark:border-slate-600 rounded-lg p-2.5 text-base text-gray-900 dark:text-slate-100 bg-gray-50 dark:bg-slate-900"
            value={name}
            onChangeText={setName}
            placeholder="Project name"
          />
          <Text className="text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5 mt-3">Description</Text>
          <TextInput
            className="border border-gray-300 dark:border-slate-600 rounded-lg p-2.5 text-base text-gray-900 dark:text-slate-100 bg-gray-50 dark:bg-slate-900 h-20"
            value={description}
            onChangeText={setDescription}
            placeholder="Description (optional)"
            multiline
            textAlignVertical="top"
          />
          <View className="flex-row gap-2 mt-3">
            <TouchableOpacity
              className="flex-1 p-2.5 rounded-lg border border-gray-300 dark:border-slate-600 items-center"
              onPress={() => {
                setName(project.name);
                setDescription(project.description ?? "");
                setEditMode(false);
              }}
            >
              <Text className="text-gray-700 dark:text-slate-300 font-semibold">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`flex-1 p-2.5 rounded-lg bg-blue-600 items-center${saving ? " opacity-60" : ""}`}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text className="text-white font-semibold">Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700 gap-2"
          onPress={() => setEditMode(true)}
          activeOpacity={0.8}
        >
          <View className="flex-row justify-between items-start">
            <Text className="text-lg font-bold text-gray-900 dark:text-slate-100 flex-1">{project.name}</Text>
            <Ionicons name="pencil-outline" size={16} color="#9ca3af" />
          </View>
          {project.description ? (
            <SimpleMarkdown content={project.description} />
          ) : (
            <Text className="text-xs text-gray-400 dark:text-slate-500 italic">Tap to add description</Text>
          )}
        </TouchableOpacity>
      )}

      {/* Stats */}
      <View className="flex-row gap-2">
        <View className="flex-1 bg-white dark:bg-slate-800 rounded-xl p-3.5 items-center border border-gray-200 dark:border-slate-700 gap-1">
          <Text className="text-2xl font-bold text-gray-900 dark:text-slate-100">{project.members.length}</Text>
          <Text className="text-xs text-gray-400 dark:text-slate-500">Members</Text>
        </View>
        <View className="flex-1 bg-white dark:bg-slate-800 rounded-xl p-3.5 items-center border border-gray-200 dark:border-slate-700 gap-1">
          <Text className="text-2xl font-bold text-gray-900 dark:text-slate-100">{agents.length}</Text>
          <Text className="text-xs text-gray-400 dark:text-slate-500">Agents</Text>
        </View>
        <View className="flex-1 bg-white dark:bg-slate-800 rounded-xl p-3.5 items-center border border-gray-200 dark:border-slate-700 gap-1">
          <Text className="text-2xl font-bold text-gray-900 dark:text-slate-100">{humans.length}</Text>
          <Text className="text-xs text-gray-400 dark:text-slate-500">Humans</Text>
        </View>
      </View>

      {/* Members strip */}
      {project.members.length > 0 && (
        <View className="gap-2">
          <Text className="text-xs font-semibold text-gray-700 dark:text-slate-300">Members</Text>
          <View className="flex-row flex-wrap gap-1">
            {project.members.slice(0, 8).map((m) => (
              <View
                key={m.id}
                className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/40 justify-center items-center"
              >
                <Text className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                  {m.profile.agent?.identityEmoji ?? m.profile.displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
            ))}
            {project.members.length > 8 && (
              <View className="w-9 h-9 rounded-full bg-gray-100 dark:bg-slate-700 justify-center items-center">
                <Text className="text-xs font-semibold text-gray-500 dark:text-slate-400">+{project.members.length - 8}</Text>
              </View>
            )}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

// ── Tasks Tab ─────────────────────────────────────────────────────────────────

type TaskFilter = "all" | "in_progress" | "review" | "done";

function TasksTab({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [result, reexecute] = useQuery<{ tasksByProject: Task[] }>({
    query: TASKS_BY_PROJECT_QUERY,
    variables: { projectId },
    requestPolicy: "cache-and-network",
    pause: !mounted,
  });

  const { data, fetching, error } = result;
  const allTasks = data?.tasksByProject ?? [];
  const tasks =
    filter === "all" ? allTasks : allTasks.filter((t) => t.status === filter);

  const filters: { key: TaskFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "in_progress", label: "In Progress" },
    { key: "review", label: "Review" },
    { key: "done", label: "Done" },
  ];

  return (
    <View className="flex-1">
      {/* Filter strip + view toggle */}
      <View className="flex-row items-stretch">
        {viewMode === "list" && (
          <View style={{ flex: 1 }}>
            <TabFilterStrip
              filters={filters}
              activeKey={filter}
              onSelect={setFilter}
              getCount={(key) => key === "all" ? allTasks.length : allTasks.filter((t) => t.status === key).length}
            />
          </View>
        )}
        {viewMode === "kanban" && <View style={{ flex: 1 }} />}
        <TouchableOpacity
          style={{ width: 42, height: 42 }}
          className="bg-white dark:bg-slate-800 border-b border-l border-gray-100 dark:border-slate-700 justify-center items-center"
          onPress={() => setViewMode((m) => m === "list" ? "kanban" : "list")}
          activeOpacity={0.7}
        >
          <Ionicons
            name={viewMode === "list" ? "grid-outline" : "list-outline"}
            size={20}
            color={colors.accent}
          />
        </TouchableOpacity>
      </View>

      {viewMode === "kanban" ? (
        <KanbanBoard projectId={projectId} />
      ) : fetching && tasks.length === 0 ? (
        <View className="flex-1 justify-center items-center gap-3">
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : error && tasks.length === 0 ? (
        <View className="flex-1 justify-center items-center gap-3">
          <Text className="text-red-600 text-base">Failed to load tasks</Text>
          <TouchableOpacity onPress={() => reexecute({ requestPolicy: "network-only" })}>
            <Text className="text-blue-600 text-sm font-semibold">Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(t) => t.id}
          contentContainerClassName={`p-4 gap-3${tasks.length === 0 ? " flex-1 justify-center items-center" : ""}`}
          ListEmptyComponent={
            <View className="items-center gap-2">
              <Text className="text-gray-400 dark:text-slate-500 text-base">No tasks</Text>
            </View>
          }
          ListFooterComponent={
            <TouchableOpacity
              className="flex-row items-center gap-1.5 py-3 px-4 rounded-xl border border-blue-200 dark:border-blue-800 border-dashed bg-blue-50 dark:bg-blue-900/30 justify-center mt-1"
              onPress={() => router.push(`/task/create?projectId=${projectId}`)}
            >
              <Ionicons name="add" size={16} color="#2563eb" />
              <Text className="text-blue-600 font-semibold text-sm">New Task</Text>
            </TouchableOpacity>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              className="bg-white dark:bg-slate-800 rounded-xl p-3 border border-gray-200 dark:border-slate-700 gap-1.5"
              onPress={() => router.push(`/task/${item.id}`)}
              activeOpacity={0.7}
            >
              <View className="flex-row items-center gap-2">
                <Text className="text-xs text-gray-400 dark:text-slate-500 font-medium">#{item.taskNumber}</Text>
                {item.priority && (
                  <View
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: PRIORITY_HEX_COLORS[item.priority] ?? DEFAULT_COLOR }}
                  />
                )}
              </View>
              <Text className="text-sm font-medium text-gray-900 dark:text-slate-100 leading-5" numberOfLines={2}>
                {item.title}
              </Text>
              <View className="flex-row items-center justify-between">
                <View
                  className="px-2 py-0.5 rounded-lg"
                  style={{ backgroundColor: (STATUS_HEX_COLORS[item.status] ?? DEFAULT_COLOR) + "20" }}
                >
                  <Text
                    className="text-xs font-semibold capitalize"
                    style={{ color: STATUS_HEX_COLORS[item.status] ?? DEFAULT_COLOR }}
                  >
                    {item.status.replace("_", " ")}
                  </Text>
                </View>
                {(item.assignees ?? []).length > 0 && (
                  <Text className="text-xs text-gray-400 dark:text-slate-500">
                    {item.assignees![0].profile.displayName}
                    {item.assignees!.length > 1 ? ` +${item.assignees!.length - 1}` : ""}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

// ── Members Tab ───────────────────────────────────────────────────────────────

interface ProfileOption {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  agent: { identityEmoji: string | null } | null;
}

function AddMemberModal({
  projectId,
  existingProfileIds,
  visible,
  onClose,
  onAdded,
}: {
  projectId: string;
  existingProfileIds: string[];
  visible: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [, addMember] = useMutation(ADD_PROJECT_MEMBER);

  const [profilesResult] = useQuery<{ profiles: ProfileOption[] }>({
    query: PROFILES_QUERY,
    variables: { limit: 100 },
    pause: !visible,
  });

  const profiles = (profilesResult.data?.profiles ?? []).filter(
    (p) =>
      !existingProfileIds.includes(p.id) &&
      (search.trim() === "" ||
        p.displayName.toLowerCase().includes(search.toLowerCase()) ||
        (p.username ?? "").toLowerCase().includes(search.toLowerCase()))
  );

  async function handleAdd(profileId: string) {
    const res = await addMember({ projectId, profileId });
    if (res.error) {
      Alert.alert("Error", res.error.message);
    } else {
      onAdded();
      onClose();
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-gray-50 dark:bg-slate-900">
        <View className="flex-row items-center justify-between px-4 pt-4 pb-3 border-b border-gray-200 dark:border-slate-700">
          <Text className="text-base font-bold text-gray-900 dark:text-slate-100 flex-1">Add Member</Text>
          <TouchableOpacity onPress={onClose} className="p-1">
            <Ionicons name="close" size={22} color="#374151" />
          </TouchableOpacity>
        </View>
        <View className="px-4 py-2.5 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
          <TextInput
            className="border border-gray-300 dark:border-slate-600 rounded-lg p-2.5 text-base text-gray-900 dark:text-slate-100 bg-gray-50 dark:bg-slate-900"
            placeholder="Search profiles…"
            placeholderTextColor="#9ca3af"
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
        </View>
        {profilesResult.fetching ? (
          <ActivityIndicator style={{ marginTop: 32 }} color="#2563eb" />
        ) : (
          <FlatList
            data={profiles}
            keyExtractor={(p) => p.id}
            contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
            ListEmptyComponent={
              <View className="p-8 items-center">
                <Text className="text-gray-400 dark:text-slate-500 text-base">No profiles found</Text>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => pressed ? { backgroundColor: "#f3f4f6" } : undefined}
                className="bg-white dark:bg-slate-800 rounded-xl p-3 border border-gray-200 dark:border-slate-700 flex-row items-center gap-3"
                onPress={() => handleAdd(item.id)}
              >
                <View className="w-11 h-11 rounded-full bg-blue-100 dark:bg-blue-900/40 justify-center items-center">
                  <Text className="text-lg font-semibold text-blue-700 dark:text-blue-300">
                    {item.agent?.identityEmoji ?? item.displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View className="flex-1 gap-0.5">
                  <Text className="text-base font-semibold text-gray-900 dark:text-slate-100">{item.displayName}</Text>
                  <Text className="text-xs text-gray-400 dark:text-slate-500">@{item.username}</Text>
                </View>
                <Ionicons name="add-circle-outline" size={22} color="#2563eb" />
              </Pressable>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

function MembersTab({
  project,
  onRefresh,
}: {
  project: Project;
  onRefresh: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [, removeMember] = useMutation(REMOVE_PROJECT_MEMBER);

  function confirmRemove(member: ProjectMember) {
    Alert.alert(
      "Remove Member",
      `Remove ${member.profile.displayName} from ${project.name}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            const res = await removeMember({
              projectId: project.id,
              profileId: member.profileId,
            });
            if (res.error) {
              Alert.alert("Error", res.error.message);
            } else {
              onRefresh();
            }
          },
        },
      ]
    );
  }

  return (
    <>
      <FlatList
        data={project.members}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 16 }}
        ListHeaderComponent={
          <TouchableOpacity
            className="flex-row items-center gap-2 bg-blue-50 dark:bg-blue-900/30 rounded-xl p-3 mb-2 border border-blue-200 dark:border-blue-800"
            onPress={() => setAddModalOpen(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="person-add-outline" size={18} color="#2563eb" />
            <Text className="text-sm font-semibold text-blue-600">Add Member</Text>
          </TouchableOpacity>
        }
        ListEmptyComponent={
          <View className="items-center gap-2">
            <Text className="text-gray-400 dark:text-slate-500 text-base">No members yet</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View className="bg-white dark:bg-slate-800 rounded-xl p-3 border border-gray-200 dark:border-slate-700 flex-row items-center gap-3">
            <View className="w-11 h-11 rounded-full bg-blue-100 dark:bg-blue-900/40 justify-center items-center">
              <Text className="text-lg font-semibold text-blue-700 dark:text-blue-300">
                {item.profile.agent?.identityEmoji ??
                  item.profile.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View className="flex-1 gap-0.5">
              <Text className="text-base font-semibold text-gray-900 dark:text-slate-100">{item.profile.displayName}</Text>
              <Text className="text-xs text-gray-400 dark:text-slate-500">@{item.profile.username}</Text>
              {item.profile.agentId && item.profile.agent && (
                <Text className="text-xs text-gray-500 dark:text-slate-400 capitalize">{item.profile.agent.role}</Text>
              )}
            </View>
            <TouchableOpacity
              className="p-1"
              onPress={() => confirmRemove(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="person-remove-outline" size={18} color="#dc2626" />
            </TouchableOpacity>
          </View>
        )}
      />
      <AddMemberModal
        projectId={project.id}
        existingProfileIds={project.members.map((m) => m.profileId)}
        visible={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onAdded={onRefresh}
      />
    </>
  );
}

// ── Docs Tab ──────────────────────────────────────────────────────────────────

function DocViewModal({
  docId,
  visible,
  onClose,
  onEdited,
}: {
  docId: string;
  visible: boolean;
  onClose: () => void;
  onEdited: () => void;
}) {
  const [showEdit, setShowEdit] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedRevision, setSelectedRevision] = useState<DocRevision | null>(null);

  const [result, reexecute] = useQuery<{ projectDoc: ProjectDocFull }>({
    query: PROJECT_DOC_QUERY,
    variables: { id: docId },
    pause: !visible || !docId,
    requestPolicy: "cache-and-network",
  });
  const [revisionsResult] = useQuery<{ projectDocRevisions: DocRevision[] }>({
    query: PROJECT_DOC_REVISIONS_QUERY,
    variables: { docId },
    pause: !showHistory || !docId,
    requestPolicy: "cache-and-network",
  });

  const doc = result.data?.projectDoc;
  const revisions = revisionsResult.data?.projectDocRevisions ?? [];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-white dark:bg-slate-800">
        <View className="flex-row items-center justify-between px-4 pt-4 pb-3 border-b border-gray-200 dark:border-slate-700">
          <TouchableOpacity onPress={onClose} className="p-1">
            <Ionicons name="close" size={22} color="#374151" />
          </TouchableOpacity>
          <Text className="text-base font-bold text-gray-900 dark:text-slate-100 flex-1 text-center" numberOfLines={1}>
            {selectedRevision ? `v${revisions.length - revisions.indexOf(selectedRevision)} — ${selectedRevision.title}` : (doc?.title ?? "Loading...")}
          </Text>
          {selectedRevision ? (
            <TouchableOpacity onPress={() => setSelectedRevision(null)} className="p-1">
              <Text className="text-gray-500 dark:text-slate-400 text-sm">Back</Text>
            </TouchableOpacity>
          ) : showHistory ? (
            <TouchableOpacity onPress={() => setShowHistory(false)} className="p-1">
              <Text className="text-gray-500 dark:text-slate-400 text-sm">Back</Text>
            </TouchableOpacity>
          ) : (
            <View className="flex-row">
              <TouchableOpacity onPress={() => setShowHistory(true)} className="p-1">
                <Ionicons name="time-outline" size={20} color="#6b7280" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowEdit(true)} className="p-1" disabled={!doc}>
                <Text className="text-blue-600 text-base font-semibold">Edit</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {selectedRevision ? (
          <ScrollView contentContainerClassName="p-4 gap-4">
            <View className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-2.5 mb-3 flex-row items-center gap-2">
              <Ionicons name="information-circle-outline" size={16} color="#d97706" />
              <Text className="text-xs text-yellow-800 dark:text-yellow-200 flex-1">
                Viewing past revision — {new Date(selectedRevision.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                {selectedRevision.editedBy ? ` by ${selectedRevision.editedBy.identityEmoji ?? ""} ${selectedRevision.editedBy.name}` : ""}
              </Text>
            </View>
            {selectedRevision.summary ? (
              <Text className="text-sm text-gray-500 dark:text-slate-400 italic leading-5 p-3 bg-gray-50 dark:bg-slate-900 rounded-lg">{selectedRevision.summary}</Text>
            ) : null}
            <Text className="text-sm text-gray-900 dark:text-slate-100 leading-6">{selectedRevision.content}</Text>
          </ScrollView>
        ) : showHistory ? (
          revisionsResult.fetching ? (
            <View className="flex-1 justify-center items-center gap-3">
              <ActivityIndicator size="large" color="#2563eb" />
            </View>
          ) : revisions.length === 0 ? (
            <View className="flex-1 justify-center items-center gap-3">
              <Text className="text-gray-400 dark:text-slate-500 text-base">No revision history</Text>
            </View>
          ) : (
            <ScrollView contentContainerClassName="p-4 gap-2.5">
              {revisions.map((rev, idx) => (
                <TouchableOpacity
                  key={rev.id}
                  className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-3.5 gap-1"
                  onPress={() => setSelectedRevision(rev)}
                  activeOpacity={0.75}
                >
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs font-bold text-gray-900 dark:text-slate-100">
                      Revision {revisions.length - idx}
                      {idx === 0 && <Text className="text-green-600 font-semibold"> (Latest)</Text>}
                    </Text>
                    <Text className="text-xs text-gray-400 dark:text-slate-500">
                      {new Date(rev.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </Text>
                  </View>
                  {rev.editedBy && (
                    <Text className="text-xs text-gray-500 dark:text-slate-400">
                      {rev.editedBy.identityEmoji ?? ""} {rev.editedBy.name}
                    </Text>
                  )}
                  {rev.editAction && (
                    <Text className="text-xs text-gray-400 dark:text-slate-500 italic">{rev.editAction}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )
        ) : result.fetching ? (
          <View className="flex-1 justify-center items-center gap-3">
            <ActivityIndicator size="large" color="#2563eb" />
          </View>
        ) : doc ? (
          <ScrollView contentContainerClassName="p-4 gap-4">
            {doc.summary ? (
              <Text className="text-sm text-gray-500 dark:text-slate-400 italic leading-5 p-3 bg-gray-50 dark:bg-slate-900 rounded-lg">{doc.summary}</Text>
            ) : null}
            <Text className="text-sm text-gray-900 dark:text-slate-100 leading-6">{doc.content}</Text>
          </ScrollView>
        ) : (
          <View className="flex-1 justify-center items-center gap-3">
            <Text className="text-red-600 text-base">Failed to load doc</Text>
          </View>
        )}
      </View>
      {doc && (
        <EditDocModal
          doc={doc}
          visible={showEdit}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            reexecute({ requestPolicy: "network-only" });
            onEdited();
          }}
        />
      )}
    </Modal>
  );
}

function EditDocModal({
  doc,
  visible,
  onClose,
  onSaved,
}: {
  doc: ProjectDocFull;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(doc.title);
  const [content, setContent] = useState(doc.content);
  const [summary, setSummary] = useState(doc.summary ?? "");
  const [saving, setSaving] = useState(false);
  const [, updateDoc] = useMutation(UPDATE_PROJECT_DOC);

  useEffect(() => {
    if (visible) {
      setTitle(doc.title);
      setContent(doc.content);
      setSummary(doc.summary ?? "");
    }
  }, [visible, doc]);

  async function handleSave() {
    if (!title.trim()) {
      Alert.alert("Error", "Title is required");
      return;
    }
    if (!content.trim()) {
      Alert.alert("Error", "Content is required");
      return;
    }
    setSaving(true);
    const res = await updateDoc({
      id: doc.id,
      title: title.trim(),
      content: content.trim(),
      summary: summary.trim() || undefined,
    });
    setSaving(false);
    if (res.error) {
      Alert.alert("Error", res.error.message);
    } else {
      onSaved();
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <View className="flex-1 bg-white dark:bg-slate-800">
          <View className="flex-row items-center justify-between px-4 pt-4 pb-3 border-b border-gray-200 dark:border-slate-700">
            <TouchableOpacity onPress={onClose} className="p-1">
              <Ionicons name="close" size={22} color="#374151" />
            </TouchableOpacity>
            <Text className="text-base font-bold text-gray-900 dark:text-slate-100 flex-1 text-center">Edit Doc</Text>
            <TouchableOpacity onPress={handleSave} disabled={saving} className="p-1">
              {saving ? (
                <ActivityIndicator size="small" color="#2563eb" />
              ) : (
                <Text className="text-blue-600 text-base font-semibold">Save</Text>
              )}
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerClassName="p-4 gap-3" keyboardShouldPersistTaps="handled">
            <Text className="text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">Title</Text>
            <TextInput
              className="border border-gray-300 dark:border-slate-600 rounded-lg p-2.5 text-base text-gray-900 dark:text-slate-100 bg-gray-50 dark:bg-slate-900"
              value={title}
              onChangeText={setTitle}
              placeholder="Document title"
              autoFocus
            />
            <Text className="text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5 mt-3">Summary</Text>
            <TextInput
              className="border border-gray-300 dark:border-slate-600 rounded-lg p-2.5 text-base text-gray-900 dark:text-slate-100 bg-gray-50 dark:bg-slate-900"
              value={summary}
              onChangeText={setSummary}
              placeholder="Brief summary…"
            />
            <Text className="text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5 mt-3">Content (Markdown)</Text>
            <TextInput
              className="border border-gray-300 dark:border-slate-600 rounded-lg p-2.5 text-base text-gray-900 dark:text-slate-100 bg-gray-50 dark:bg-slate-900 h-60"
              value={content}
              onChangeText={setContent}
              placeholder={"# Heading\n\nYour content here..."}
              multiline
              textAlignVertical="top"
            />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function AddDocModal({
  projectId,
  visible,
  onClose,
  onCreated,
}: {
  projectId: string;
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [, createDoc] = useMutation(CREATE_PROJECT_DOC);

  async function handleCreate() {
    if (!title.trim()) {
      Alert.alert("Error", "Title is required");
      return;
    }
    if (!content.trim()) {
      Alert.alert("Error", "Content is required");
      return;
    }
    setSaving(true);
    const res = await createDoc({ projectId, title: title.trim(), content: content.trim() });
    setSaving(false);
    if (res.error) {
      Alert.alert("Error", res.error.message);
    } else {
      setTitle("");
      setContent("");
      onCreated();
      onClose();
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <View className="flex-1 bg-white dark:bg-slate-800">
          <View className="flex-row items-center justify-between px-4 pt-4 pb-3 border-b border-gray-200 dark:border-slate-700">
            <Text className="text-base font-bold text-gray-900 dark:text-slate-100 flex-1">Add Doc</Text>
            <TouchableOpacity onPress={onClose} className="p-1">
              <Ionicons name="close" size={22} color="#374151" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerClassName="p-4 gap-3">
            <Text className="text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">Title</Text>
            <TextInput
              className="border border-gray-300 dark:border-slate-600 rounded-lg p-2.5 text-base text-gray-900 dark:text-slate-100 bg-gray-50 dark:bg-slate-900"
              value={title}
              onChangeText={setTitle}
              placeholder="Document title"
            />
            <Text className="text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5 mt-3">Content (Markdown)</Text>
            <TextInput
              className="border border-gray-300 dark:border-slate-600 rounded-lg p-2.5 text-base text-gray-900 dark:text-slate-100 bg-gray-50 dark:bg-slate-900 h-52"
              value={content}
              onChangeText={setContent}
              placeholder={"# Heading\n\nYour content here..."}
              multiline
              textAlignVertical="top"
            />
            <TouchableOpacity
              className={`flex-1 p-2.5 rounded-lg bg-blue-600 items-center mt-4${saving ? " opacity-60" : ""}`}
              onPress={handleCreate}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text className="text-white font-semibold">Create Doc</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function DocsTab({ projectId }: { projectId: string }) {
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [, deleteDoc] = useMutation(DELETE_PROJECT_DOC);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [result, reexecute] = useQuery<{ projectDocsByProject: ProjectDoc[] }>({
    query: PROJECT_DOCS_BY_PROJECT_QUERY,
    variables: { projectId },
    requestPolicy: "cache-and-network",
    pause: !mounted,
  });

  const { data, fetching, error } = result;
  const docs = data?.projectDocsByProject ?? [];

  function confirmDelete(doc: ProjectDoc) {
    Alert.alert("Delete Doc", `Delete "${doc.title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const res = await deleteDoc({ id: doc.id });
          if (res.error) {
            Alert.alert("Error", res.error.message);
          } else {
            reexecute({ requestPolicy: "network-only" });
          }
        },
      },
    ]);
  }

  return (
    <View className="flex-1">
      {fetching && docs.length === 0 ? (
        <View className="flex-1 justify-center items-center gap-3">
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : error && docs.length === 0 ? (
        <View className="flex-1 justify-center items-center gap-3">
          <Text className="text-red-600 text-base">Failed to load docs</Text>
          <TouchableOpacity onPress={() => reexecute({ requestPolicy: "network-only" })}>
            <Text className="text-blue-600 text-sm font-semibold">Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={docs}
          keyExtractor={(d) => d.id}
          contentContainerClassName={`p-4 gap-3${docs.length === 0 ? " flex-1 justify-center items-center" : ""}`}
          ListEmptyComponent={
            <View className="items-center gap-2">
              <Text className="text-gray-400 dark:text-slate-500 text-base">No docs yet</Text>
            </View>
          }
          ListFooterComponent={
            <TouchableOpacity
              className="flex-row items-center gap-1.5 py-3 px-4 rounded-xl border border-blue-200 dark:border-blue-800 border-dashed bg-blue-50 dark:bg-blue-900/30 justify-center mt-1"
              onPress={() => setShowAddDoc(true)}
            >
              <Ionicons name="add" size={16} color="#2563eb" />
              <Text className="text-blue-600 font-semibold text-sm">Add Doc</Text>
            </TouchableOpacity>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              className="bg-white dark:bg-slate-800 rounded-xl p-3 border border-gray-200 dark:border-slate-700 flex-row items-center gap-2"
              onPress={() => setSelectedDocId(item.id)}
              activeOpacity={0.7}
            >
              <View className="flex-1 flex-row gap-2.5 items-start">
                <Ionicons name="document-text-outline" size={20} color="#6b7280" />
                <View className="flex-1 gap-0.5">
                  <Text className="text-sm font-semibold text-gray-900 dark:text-slate-100">{item.title}</Text>
                  {item.summary ? (
                    <Text className="text-xs text-gray-500 dark:text-slate-400" numberOfLines={1}>
                      {item.summary}
                    </Text>
                  ) : null}
                  <Text className="text-xs text-gray-400 dark:text-slate-500">
                    Updated {formatDate(item.updatedAt)}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => confirmDelete(item)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="trash-outline" size={18} color="#dc2626" />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}

      <DocViewModal
        docId={selectedDocId ?? ""}
        visible={selectedDocId !== null}
        onClose={() => setSelectedDocId(null)}
        onEdited={() => reexecute({ requestPolicy: "network-only" })}
      />
      <AddDocModal
        projectId={projectId}
        visible={showAddDoc}
        onClose={() => setShowAddDoc(false)}
        onCreated={() => reexecute({ requestPolicy: "network-only" })}
      />
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const { colors } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [result, reexecute] = useQuery<{ project: Project }>({
    query: PROJECT_QUERY,
    variables: { id },
    requestPolicy: "cache-and-network",
    pause: !mounted,
  });

  const [, archiveProject] = useMutation(ARCHIVE_PROJECT);
  const [, restoreProject] = useMutation(RESTORE_PROJECT);
  const [, setProjectShutdown] = useMutation(SET_PROJECT_SHUTDOWN);

  const { data, fetching, error } = result;
  const project = data?.project;

  function handleMoreActions() {
    if (!project) return;
    const isArchived = project.status === "archived";
    const isShutdown = project.shutdownActive;

    Alert.alert("Project Actions", undefined, [
      {
        text: isShutdown ? "Resume Project" : "Pause Project",
        onPress: async () => {
          const res = await setProjectShutdown({ projectId: id, active: !isShutdown });
          if (res.error) Alert.alert("Error", res.error.message ?? "Failed to update");
          else reexecute({ requestPolicy: "network-only" });
        },
      },
      isArchived
        ? {
            text: "Restore Project",
            onPress: async () => {
              const res = await restoreProject({ id });
              if (res.error) Alert.alert("Error", res.error.message ?? "Failed to restore");
              else reexecute({ requestPolicy: "network-only" });
            },
          }
        : {
            text: "Archive Project",
            style: "destructive" as const,
            onPress: () => {
              Alert.alert(
                "Archive Project",
                "This project will be archived and hidden from active lists.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Archive",
                    style: "destructive",
                    onPress: async () => {
                      const res = await archiveProject({ id });
                      if (res.error) Alert.alert("Error", res.error.message ?? "Failed to archive");
                      else router.back();
                    },
                  },
                ]
              );
            },
          },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  useEffect(() => {
    if (project) {
      navigation.setOptions({
        title: project.name,
        headerRight: () => (
          <TouchableOpacity onPress={handleMoreActions} style={{ padding: 8 }}>
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.icon} />
          </TouchableOpacity>
        ),
      });
    }
  }, [project?.name, project?.status, project?.shutdownActive]);

  if (fetching && !project) {
    return (
      <View className="flex-1 justify-center items-center gap-3">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (error && !project) {
    return (
      <View className="flex-1 justify-center items-center gap-3">
        <Text className="text-red-600 text-base">Failed to load project</Text>
        <TouchableOpacity onPress={() => reexecute({ requestPolicy: "network-only" })}>
          <Text className="text-blue-600 text-sm font-semibold">Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!project) return null;

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "tasks", label: "Tasks" },
    { key: "members", label: "Members" },
    { key: "docs", label: "Docs" },
  ];

  return (
    <View className="flex-1 bg-gray-50 dark:bg-slate-900">
      {/* Tab bar */}
      <View className="flex-row bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 min-h-12">
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            className={`flex-1 py-3.5 items-center justify-center border-b-2${activeTab === tab.key ? " border-blue-600" : " border-transparent"}`}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text
              className={`text-xs font-medium${activeTab === tab.key ? " text-blue-600" : " text-gray-400 dark:text-slate-500"}`}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab content */}
      {activeTab === "overview" && (
        <OverviewTab project={project} onRefresh={() => reexecute({ requestPolicy: "network-only" })} />
      )}
      {activeTab === "tasks" && <TasksTab projectId={project.id} />}
      {activeTab === "members" && (
        <MembersTab
          project={project}
          onRefresh={() => reexecute({ requestPolicy: "network-only" })}
        />
      )}
      {activeTab === "docs" && <DocsTab projectId={project.id} />}
    </View>
  );
}
