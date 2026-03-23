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
      contentContainerStyle={styles.tabContent}
    >
      {/* Shutdown banner */}
      {project.shutdownActive && (
        <View style={{ backgroundColor: "#fffbeb", borderRadius: 10, borderWidth: 1, borderColor: "#fde68a", padding: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Ionicons name="pause-circle-outline" size={20} color="#d97706" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#92400e" }}>Project Paused</Text>
            <Text style={{ fontSize: 12, color: "#b45309", marginTop: 2 }}>New task creation and agent work are blocked.</Text>
          </View>
        </View>
      )}

      {/* Status + Created */}
      <View style={styles.metaRow}>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: STATUS_HEX_COLORS[project.status] ?? DEFAULT_COLOR },
          ]}
        >
          <Text style={styles.statusBadgeText}>{project.status}</Text>
        </View>
        <Text style={styles.metaText}>Created {formatDate(project.createdAt)}</Text>
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
            <SimpleMarkdown content={project.description} />
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
        showsVerticalScrollIndicator={false}
        bounces={false}
        directionalLockEnabled={true}
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
                      { backgroundColor: PRIORITY_HEX_COLORS[item.priority] ?? DEFAULT_COLOR },
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
                    { backgroundColor: (STATUS_HEX_COLORS[item.status] ?? DEFAULT_COLOR) + "20" },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      { color: STATUS_HEX_COLORS[item.status] ?? DEFAULT_COLOR },
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
      <View style={{ flex: 1, backgroundColor: "#f9fafb" }}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Add Member</Text>
          <TouchableOpacity onPress={onClose} style={styles.modalClose}>
            <Ionicons name="close" size={22} color="#374151" />
          </TouchableOpacity>
        </View>
        <View style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" }}>
          <TextInput
            style={[styles.editInput, { marginBottom: 0 }]}
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
              <View style={{ padding: 32, alignItems: "center" }}>
                <Text style={{ color: "#9ca3af", fontSize: 15 }}>No profiles found</Text>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.memberCard,
                  pressed && { backgroundColor: "#f3f4f6" },
                ]}
                onPress={() => handleAdd(item.id)}
              >
                <View style={styles.memberAvatarLg}>
                  <Text style={styles.memberAvatarText}>
                    {item.agent?.identityEmoji ?? item.displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{item.displayName}</Text>
                  <Text style={styles.memberUsername}>@{item.username}</Text>
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
        contentContainerStyle={[
          styles.tabContent,
          { paddingBottom: insets.bottom + 16 },
          project.members.length === 0 && styles.emptyFlex,
        ]}
        ListHeaderComponent={
          <TouchableOpacity
            style={styles.addMemberBtn}
            onPress={() => setAddModalOpen(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="person-add-outline" size={18} color="#2563eb" />
            <Text style={styles.addMemberBtnText}>Add Member</Text>
          </TouchableOpacity>
        }
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
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose} style={styles.modalClose}>
            <Ionicons name="close" size={22} color="#374151" />
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { flex: 1, textAlign: "center" }]} numberOfLines={1}>
            {selectedRevision ? `v${revisions.length - revisions.indexOf(selectedRevision)} — ${selectedRevision.title}` : (doc?.title ?? "Loading...")}
          </Text>
          {selectedRevision ? (
            <TouchableOpacity onPress={() => setSelectedRevision(null)} style={styles.modalClose}>
              <Text style={{ color: "#6b7280", fontSize: 14 }}>Back</Text>
            </TouchableOpacity>
          ) : showHistory ? (
            <TouchableOpacity onPress={() => setShowHistory(false)} style={styles.modalClose}>
              <Text style={{ color: "#6b7280", fontSize: 14 }}>Back</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ flexDirection: "row" }}>
              <TouchableOpacity onPress={() => setShowHistory(true)} style={[styles.modalClose, { marginRight: 0 }]}>
                <Ionicons name="time-outline" size={20} color="#6b7280" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowEdit(true)} style={styles.modalClose} disabled={!doc}>
                <Text style={{ color: "#2563eb", fontSize: 15, fontWeight: "600" }}>Edit</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {selectedRevision ? (
          <ScrollView contentContainerStyle={styles.docContent}>
            <View style={{ backgroundColor: "#fffbeb", borderRadius: 8, padding: 10, marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="information-circle-outline" size={16} color="#d97706" />
              <Text style={{ fontSize: 12, color: "#92400e", flex: 1 }}>
                Viewing past revision — {new Date(selectedRevision.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                {selectedRevision.editedBy ? ` by ${selectedRevision.editedBy.identityEmoji ?? ""} ${selectedRevision.editedBy.name}` : ""}
              </Text>
            </View>
            {selectedRevision.summary ? <Text style={styles.docSummary}>{selectedRevision.summary}</Text> : null}
            <Text style={styles.docBody}>{selectedRevision.content}</Text>
          </ScrollView>
        ) : showHistory ? (
          revisionsResult.fetching ? (
            <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>
          ) : revisions.length === 0 ? (
            <View style={styles.center}><Text style={styles.emptyText}>No revision history</Text></View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
              {revisions.map((rev, idx) => (
                <TouchableOpacity
                  key={rev.id}
                  style={{ backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#e5e7eb", padding: 14, gap: 4 }}
                  onPress={() => setSelectedRevision(rev)}
                  activeOpacity={0.75}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#111827" }}>
                      Revision {revisions.length - idx}
                      {idx === 0 && <Text style={{ color: "#16a34a", fontWeight: "600" }}> (Latest)</Text>}
                    </Text>
                    <Text style={{ fontSize: 11, color: "#9ca3af" }}>
                      {new Date(rev.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </Text>
                  </View>
                  {rev.editedBy && (
                    <Text style={{ fontSize: 12, color: "#6b7280" }}>
                      {rev.editedBy.identityEmoji ?? ""} {rev.editedBy.name}
                    </Text>
                  )}
                  {rev.editAction && (
                    <Text style={{ fontSize: 11, color: "#9ca3af", fontStyle: "italic" }}>{rev.editAction}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )
        ) : result.fetching ? (
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
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={onClose} style={styles.modalClose}>
              <Ionicons name="close" size={22} color="#374151" />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { flex: 1, textAlign: "center" }]}>Edit Doc</Text>
            <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.modalClose}>
              {saving ? (
                <ActivityIndicator size="small" color="#2563eb" />
              ) : (
                <Text style={{ color: "#2563eb", fontSize: 15, fontWeight: "600" }}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.tabContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.editLabel}>Title</Text>
            <TextInput
              style={styles.editInput}
              value={title}
              onChangeText={setTitle}
              placeholder="Document title"
              autoFocus
            />
            <Text style={[styles.editLabel, { marginTop: 12 }]}>Summary</Text>
            <TextInput
              style={styles.editInput}
              value={summary}
              onChangeText={setSummary}
              placeholder="Brief summary…"
            />
            <Text style={[styles.editLabel, { marginTop: 12 }]}>Content (Markdown)</Text>
            <TextInput
              style={[styles.editInput, { height: 240 }]}
              value={content}
              onChangeText={setContent}
              placeholder="# Heading&#10;&#10;Your content here..."
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

  const [result, reexecute] = useQuery<{ project: Project }>({
    query: PROJECT_QUERY,
    variables: { id },
    requestPolicy: "cache-and-network",
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
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginRight: 8 }}>
            <TouchableOpacity
              onPress={() => router.push(`/kanban/${project.id}`)}
              style={{ padding: 8 }}
            >
              <Ionicons name="grid-outline" size={22} color="#2563eb" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleMoreActions} style={{ padding: 8 }}>
              <Ionicons name="ellipsis-horizontal" size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>
        ),
      });
    }
  }, [project?.name, project?.status, project?.shutdownActive]);

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
    minHeight: 46,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
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
  filterBar: { height: 52, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  filterContent: { paddingHorizontal: 12, gap: 8, flexDirection: "row", alignItems: "center", height: 52 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
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
  addMemberBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#eff6ff",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  addMemberBtnText: { fontSize: 14, fontWeight: "600", color: "#2563eb" },

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
