import {
  View,
  Text,
  ScrollView,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useQuery, useMutation } from "urql";
import { useEffect, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  PROJECT_QUERY,
  TASKS_BY_PROJECT_QUERY,
  PROJECT_DOCS_BY_PROJECT_QUERY,
  PROJECT_DOC_QUERY,
  UPDATE_PROJECT,
  ADD_PROJECT_MEMBER,
  REMOVE_PROJECT_MEMBER,
  CREATE_PROJECT_DOC,
  DELETE_PROJECT_DOC,
} from "@agentcenter/graphql-client";
import { useAuth } from "../../src/context/AuthContext";

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

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active: "#16a34a",
  archived: "#6b7280",
  paused: "#d97706",
};

const TASK_STATUS_COLORS: Record<string, string> = {
  inbox: "#6b7280",
  assigned: "#2563eb",
  in_progress: "#d97706",
  review: "#7c3aed",
  done: "#16a34a",
  blocked: "#dc2626",
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "#dc2626",
  high: "#d97706",
  medium: "#2563eb",
  low: "#6b7280",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

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
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.tabContent}
    >
      {/* Status + Created */}
      <View style={styles.metaRow}>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: STATUS_COLORS[project.status] ?? "#6b7280" },
          ]}
        >
          <Text style={styles.statusBadgeText}>{project.status}</Text>
        </View>
        <Text style={styles.metaText}>Created {fmtDate(project.createdAt)}</Text>
      </View>

      {/* Edit / View name + description */}
      {editMode ? (
        <View style={styles.editCard}>
          <Text style={styles.editLabel}>Name</Text>
          <TextInput
            style={styles.editInput}
            value={name}
            onChangeText={setName}
            placeholder="Project name"
          />
          <Text style={[styles.editLabel, { marginTop: 12 }]}>Description</Text>
          <TextInput
            style={[styles.editInput, { height: 80 }]}
            value={description}
            onChangeText={setDescription}
            placeholder="Description (optional)"
            multiline
            textAlignVertical="top"
          />
          <View style={styles.editActions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => {
                setName(project.name);
                setDescription(project.description ?? "");
                setEditMode(false);
              }}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={styles.nameCard} onPress={() => setEditMode(true)} activeOpacity={0.8}>
          <View style={styles.nameCardHeader}>
            <Text style={styles.projectNameLarge}>{project.name}</Text>
            <Ionicons name="pencil-outline" size={16} color="#9ca3af" />
          </View>
          {project.description ? (
            <Text style={styles.descriptionLarge}>{project.description}</Text>
          ) : (
            <Text style={styles.noDescription}>Tap to add description</Text>
          )}
        </TouchableOpacity>
      )}

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{project.members.length}</Text>
          <Text style={styles.statLabel}>Members</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{agents.length}</Text>
          <Text style={styles.statLabel}>Agents</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{humans.length}</Text>
          <Text style={styles.statLabel}>Humans</Text>
        </View>
      </View>

      {/* Members strip */}
      {project.members.length > 0 && (
        <View style={styles.memberStrip}>
          <Text style={styles.sectionTitle}>Members</Text>
          <View style={styles.avatarStrip}>
            {project.members.slice(0, 8).map((m) => (
              <View key={m.id} style={styles.avatarCircle}>
                <Text style={styles.avatarInitial}>
                  {m.profile.agent?.identityEmoji ?? m.profile.displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
            ))}
            {project.members.length > 8 && (
              <View style={[styles.avatarCircle, styles.avatarMore]}>
                <Text style={styles.avatarMoreText}>+{project.members.length - 8}</Text>
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
  const [filter, setFilter] = useState<TaskFilter>("all");

  const [result, reexecute] = useQuery<{ tasksByProject: Task[] }>({
    query: TASKS_BY_PROJECT_QUERY,
    variables: { projectId },
    requestPolicy: "cache-and-network",
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
    <View style={{ flex: 1 }}>
      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterContent}
      >
        {filters.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text
              style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}
            >
              {f.label}
              {f.key !== "all"
                ? ` (${allTasks.filter((t) => t.status === f.key).length})`
                : ` (${allTasks.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {fetching && tasks.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : error && tasks.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Failed to load tasks</Text>
          <TouchableOpacity onPress={() => reexecute({ requestPolicy: "network-only" })}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(t) => t.id}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[styles.tabContent, tasks.length === 0 && styles.emptyFlex]}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No tasks</Text>
            </View>
          }
          ListFooterComponent={
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => router.push(`/task/create?projectId=${projectId}`)}
            >
              <Ionicons name="add" size={16} color="#2563eb" />
              <Text style={styles.addButtonText}>New Task</Text>
            </TouchableOpacity>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.taskCard}
              onPress={() => router.push(`/task/${item.id}`)}
              activeOpacity={0.7}
            >
              <View style={styles.taskCardHeader}>
                <Text style={styles.taskNumber}>#{item.taskNumber}</Text>
                {item.priority && (
                  <View
                    style={[
                      styles.priorityDot,
                      { backgroundColor: PRIORITY_COLORS[item.priority] ?? "#6b7280" },
                    ]}
                  />
                )}
              </View>
              <Text style={styles.taskTitle} numberOfLines={2}>
                {item.title}
              </Text>
              <View style={styles.taskCardFooter}>
                <View
                  style={[
                    styles.statusPill,
                    { backgroundColor: (TASK_STATUS_COLORS[item.status] ?? "#6b7280") + "20" },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      { color: TASK_STATUS_COLORS[item.status] ?? "#6b7280" },
                    ]}
                  >
                    {item.status.replace("_", " ")}
                  </Text>
                </View>
                {(item.assignees ?? []).length > 0 && (
                  <Text style={styles.assigneeText}>
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

function MembersTab({
  project,
  onRefresh,
}: {
  project: Project;
  onRefresh: () => void;
}) {
  const insets = useSafeAreaInsets();
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
    <FlatList
      data={project.members}
      keyExtractor={(m) => m.id}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[
        styles.tabContent,
        { paddingBottom: insets.bottom + 16 },
        project.members.length === 0 && styles.emptyFlex,
      ]}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No members yet</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.memberCard}>
          <View style={styles.memberAvatarLg}>
            <Text style={styles.memberAvatarText}>
              {item.profile.agent?.identityEmoji ??
                item.profile.displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.memberInfo}>
            <Text style={styles.memberName}>{item.profile.displayName}</Text>
            <Text style={styles.memberUsername}>@{item.profile.username}</Text>
            {item.profile.agentId && item.profile.agent && (
              <Text style={styles.memberRole}>{item.profile.agent.role}</Text>
            )}
          </View>
          <TouchableOpacity
            style={styles.removeBtn}
            onPress={() => confirmRemove(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="person-remove-outline" size={18} color="#dc2626" />
          </TouchableOpacity>
        </View>
      )}
    />
  );
}

// ── Docs Tab ──────────────────────────────────────────────────────────────────

function DocViewModal({
  docId,
  visible,
  onClose,
}: {
  docId: string;
  visible: boolean;
  onClose: () => void;
}) {
  const [result] = useQuery<{ projectDoc: ProjectDocFull }>({
    query: PROJECT_DOC_QUERY,
    variables: { id: docId },
    pause: !visible || !docId,
    requestPolicy: "cache-and-network",
  });

  const doc = result.data?.projectDoc;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle} numberOfLines={1}>
            {doc?.title ?? "Loading…"}
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.modalClose}>
            <Ionicons name="close" size={22} color="#374151" />
          </TouchableOpacity>
        </View>
        {result.fetching ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#2563eb" />
          </View>
        ) : doc ? (
          <ScrollView contentContainerStyle={styles.docContent}>
            {doc.summary ? (
              <Text style={styles.docSummary}>{doc.summary}</Text>
            ) : null}
            <Text style={styles.docBody}>{doc.content}</Text>
          </ScrollView>
        ) : (
          <View style={styles.center}>
            <Text style={styles.errorText}>Failed to load doc</Text>
          </View>
        )}
      </View>
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
        style={{ flex: 1 }}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Doc</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalClose}>
              <Ionicons name="close" size={22} color="#374151" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.tabContent}>
            <Text style={styles.editLabel}>Title</Text>
            <TextInput
              style={styles.editInput}
              value={title}
              onChangeText={setTitle}
              placeholder="Document title"
            />
            <Text style={[styles.editLabel, { marginTop: 12 }]}>Content (Markdown)</Text>
            <TextInput
              style={[styles.editInput, { height: 200 }]}
              value={content}
              onChangeText={setContent}
              placeholder="# Heading&#10;&#10;Your content here..."
              multiline
              textAlignVertical="top"
            />
            <TouchableOpacity
              style={[styles.saveBtn, { marginTop: 16 }, saving && { opacity: 0.6 }]}
              onPress={handleCreate}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>Create Doc</Text>
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

  const [result, reexecute] = useQuery<{ projectDocsByProject: ProjectDoc[] }>({
    query: PROJECT_DOCS_BY_PROJECT_QUERY,
    variables: { projectId },
    requestPolicy: "cache-and-network",
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
    <View style={{ flex: 1 }}>
      {fetching && docs.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : error && docs.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Failed to load docs</Text>
          <TouchableOpacity onPress={() => reexecute({ requestPolicy: "network-only" })}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={docs}
          keyExtractor={(d) => d.id}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[styles.tabContent, docs.length === 0 && styles.emptyFlex]}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No docs yet</Text>
            </View>
          }
          ListFooterComponent={
            <TouchableOpacity style={styles.addButton} onPress={() => setShowAddDoc(true)}>
              <Ionicons name="add" size={16} color="#2563eb" />
              <Text style={styles.addButtonText}>Add Doc</Text>
            </TouchableOpacity>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.docCard}
              onPress={() => setSelectedDocId(item.id)}
              activeOpacity={0.7}
            >
              <View style={styles.docCardContent}>
                <Ionicons name="document-text-outline" size={20} color="#6b7280" />
                <View style={styles.docCardInfo}>
                  <Text style={styles.docCardTitle}>{item.title}</Text>
                  {item.summary ? (
                    <Text style={styles.docCardSummary} numberOfLines={1}>
                      {item.summary}
                    </Text>
                  ) : null}
                  <Text style={styles.docCardDate}>
                    Updated {fmtDate(item.updatedAt)}
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

  const [result, reexecute] = useQuery<{ project: Project }>({
    query: PROJECT_QUERY,
    variables: { id },
    requestPolicy: "cache-and-network",
  });

  const { data, fetching, error } = result;
  const project = data?.project;

  useEffect(() => {
    if (project) {
      navigation.setOptions({
        title: project.name,
        headerRight: () => (
          <TouchableOpacity
            onPress={() => router.push(`/kanban/${project.id}`)}
            style={{ marginRight: 16 }}
          >
            <Ionicons name="grid-outline" size={22} color="#2563eb" />
          </TouchableOpacity>
        ),
      });
    }
  }, [project?.name]);

  if (fetching && !project) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (error && !project) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Failed to load project</Text>
        <TouchableOpacity onPress={() => reexecute({ requestPolicy: "network-only" })}>
          <Text style={styles.retryText}>Retry</Text>
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
    <View style={styles.container}>
      {/* Tab bar */}
      <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tabButton, activeTab === tab.key && styles.tabButtonActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text
              style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}
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

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  errorText: { color: "#dc2626", fontSize: 16 },
  retryText: { color: "#2563eb", fontSize: 14, fontWeight: "600" },

  // Tab bar
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabButtonActive: { borderBottomColor: "#2563eb" },
  tabLabel: { fontSize: 13, fontWeight: "500", color: "#9ca3af" },
  tabLabelActive: { color: "#2563eb" },

  // Common content padding
  tabContent: { padding: 16, gap: 12 },
  emptyFlex: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyState: { alignItems: "center", gap: 8 },
  emptyText: { color: "#9ca3af", fontSize: 15 },

  // Overview
  metaRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusBadgeText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  metaText: { color: "#9ca3af", fontSize: 13 },

  nameCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 8,
  },
  nameCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  projectNameLarge: { fontSize: 18, fontWeight: "700", color: "#111827", flex: 1 },
  descriptionLarge: { fontSize: 14, color: "#4b5563", lineHeight: 20 },
  noDescription: { fontSize: 13, color: "#9ca3af", fontStyle: "italic" },

  editCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#2563eb",
  },
  editLabel: { fontSize: 12, fontWeight: "600", color: "#374151", marginBottom: 6 },
  editInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    color: "#111827",
    backgroundColor: "#f9fafb",
  },
  editActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  cancelBtn: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d1d5db",
    alignItems: "center",
  },
  cancelBtnText: { color: "#374151", fontWeight: "600" },
  saveBtn: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#2563eb",
    alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontWeight: "600" },

  statsRow: { flexDirection: "row", gap: 8 },
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 4,
  },
  statNumber: { fontSize: 22, fontWeight: "700", color: "#111827" },
  statLabel: { fontSize: 12, color: "#9ca3af" },

  memberStrip: { gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: "600", color: "#374151" },
  avatarStrip: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#dbeafe",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitial: { fontSize: 14, fontWeight: "600", color: "#1d4ed8" },
  avatarMore: { backgroundColor: "#f3f4f6" },
  avatarMoreText: { fontSize: 12, fontWeight: "600", color: "#6b7280" },

  // Tasks tab
  filterBar: { maxHeight: 48, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  filterContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, flexDirection: "row" },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
  },
  filterChipActive: { backgroundColor: "#dbeafe" },
  filterChipText: { fontSize: 13, color: "#6b7280", fontWeight: "500" },
  filterChipTextActive: { color: "#2563eb", fontWeight: "600" },

  taskCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 6,
  },
  taskCardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  taskNumber: { fontSize: 12, color: "#9ca3af", fontWeight: "500" },
  priorityDot: { width: 8, height: 8, borderRadius: 4 },
  taskTitle: { fontSize: 14, fontWeight: "500", color: "#111827", lineHeight: 20 },
  taskCardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusPillText: { fontSize: 11, fontWeight: "600", textTransform: "capitalize" },
  assigneeText: { fontSize: 12, color: "#9ca3af" },

  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderStyle: "dashed",
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    marginTop: 4,
  },
  addButtonText: { color: "#2563eb", fontWeight: "600", fontSize: 14 },

  // Members tab
  memberCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  memberAvatarLg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#dbeafe",
    justifyContent: "center",
    alignItems: "center",
  },
  memberAvatarText: { fontSize: 18, fontWeight: "600", color: "#1d4ed8" },
  memberInfo: { flex: 1, gap: 2 },
  memberName: { fontSize: 15, fontWeight: "600", color: "#111827" },
  memberUsername: { fontSize: 12, color: "#9ca3af" },
  memberRole: { fontSize: 12, color: "#6b7280", textTransform: "capitalize" },
  removeBtn: { padding: 4 },

  // Docs tab
  docCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  docCardContent: { flex: 1, flexDirection: "row", gap: 10, alignItems: "flex-start" },
  docCardInfo: { flex: 1, gap: 2 },
  docCardTitle: { fontSize: 14, fontWeight: "600", color: "#111827" },
  docCardSummary: { fontSize: 12, color: "#6b7280" },
  docCardDate: { fontSize: 11, color: "#9ca3af" },

  // Modal
  modalContainer: { flex: 1, backgroundColor: "#fff" },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalTitle: { fontSize: 16, fontWeight: "700", color: "#111827", flex: 1 },
  modalClose: { padding: 4 },
  docContent: { padding: 16, gap: 16 },
  docSummary: {
    fontSize: 14,
    color: "#6b7280",
    fontStyle: "italic",
    lineHeight: 20,
    padding: 12,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
  },
  docBody: { fontSize: 14, color: "#111827", lineHeight: 22 },
});
