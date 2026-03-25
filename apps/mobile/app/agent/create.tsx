import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Clipboard,
} from "react-native";
import { useState, useMemo } from "react";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation } from "urql";
import { useAuth } from "../../src/context/AuthContext";
import { getStoredCookie } from "../../src/api/session";
import {
  TEMPLATES,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  type WizardTemplate,
  type SetupMode,
  type AgentConfigFile,
  type AgentSetupResult,
  AGENT_LEVEL_KEYS,
  AGENT_EMOJI_PRESETS,
  SETUP_MODE_LABELS,
  DEFAULT_AGENT_EMOJI,
  DEFAULT_AGENT_LEVEL,
  DEFAULT_SETUP_MODE,
  SQUAD_LEAD_ROLE,
} from "@agentcenter/utils";
import {
  AGENTS_FOR_DELEGATE_QUERY,
  CREATE_TASK_FROM_DASHBOARD,
} from "@agentcenter/graphql-client";

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = "template" | "preview" | "details" | "setup";
type Level = (typeof AGENT_LEVEL_KEYS)[number];

// ── Main Component ────────────────────────────────────────────────────────────

export default function CreateAgentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { serverUrl } = useAuth();

  const [step, setStep] = useState<Step>("template");
  const [selectedTemplate, setSelectedTemplate] = useState<WizardTemplate | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Details form state
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("");
  const [emoji, setEmoji] = useState(DEFAULT_AGENT_EMOJI);
  const [level, setLevel] = useState<Level>(DEFAULT_AGENT_LEVEL);
  const [personality, setPersonality] = useState("");
  const [workspacePath, setWorkspacePath] = useState("");

  // Setup state
  const [result, setResult] = useState<AgentSetupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [setupMode, setSetupMode] = useState<SetupMode>(DEFAULT_SETUP_MODE);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [delegateStatus, setDelegateStatus] = useState<"idle" | "creating" | "done">("idle");
  const [delegateTaskNumber, setDelegateTaskNumber] = useState<number | null>(null);
  const [cloudVms, setCloudVms] = useState<Array<{
    id: string; name?: string | null; serverName?: string | null;
    region: string; serverType: string; ipv4?: string | null; status: string;
  }>>([]);
  const [cloudVmId, setCloudVmId] = useState<string | null>(null);
  const [cloudVmsLoading, setCloudVmsLoading] = useState(false);
  const [cloudDeploying, setCloudDeploying] = useState(false);
  const [selectedVmId, setSelectedVmId] = useState<string>("");

  const [agentsResult] = useQuery({ query: AGENTS_FOR_DELEGATE_QUERY });
  const squadLeads = useMemo(() =>
    (agentsResult.data?.agents ?? []).filter(
      (a: { role?: string; setupStatus?: string }) =>
        a.role === SQUAD_LEAD_ROLE && a.setupStatus !== "deactivated",
    ),
    [agentsResult.data],
  );

  const [, createTask] = useMutation(CREATE_TASK_FROM_DASHBOARD);

  const authHeader = (): Record<string, string> => {
    const cookie = getStoredCookie();
    return cookie ? { Cookie: `mc_session=${cookie}` } : {};
  };

  // Filtered templates
  const filteredTemplates = useMemo(() => {
    let list = TEMPLATES;
    if (categoryFilter !== "all") list = list.filter((t) => t.category === categoryFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.role.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q),
      );
    }
    return list;
  }, [categoryFilter, search]);

  const categories = useMemo(
    () => CATEGORY_ORDER.filter((c) => TEMPLATES.some((t) => t.category === c)),
    [],
  );

  function applyTemplate(t: WizardTemplate) {
    setSelectedTemplate(t);
    setRole(t.role ?? "");
    setEmoji(t.emoji ?? DEFAULT_AGENT_EMOJI);
    setPersonality(t.personality ?? "");
    const lvl = AGENT_LEVEL_KEYS.includes(t.level as Level) ? (t.level as Level) : "specialist";
    setLevel(lvl);
    setStep("details");
  }

  const handleCreate = async () => {
    if (!name.trim()) { Alert.alert("Required", "Agent name is required"); return; }
    if (!role.trim()) { Alert.alert("Required", "Agent role is required"); return; }
    if (!serverUrl) { Alert.alert("Error", "No server URL configured"); return; }

    setLoading(true);
    try {
      const res = await fetch(`${serverUrl}/api/agents/create`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...authHeader(),
        },
        body: JSON.stringify({
          name: name.trim(),
          role: role.trim(),
          identityEmoji: emoji,
          level,
          personality: personality.trim() || undefined,
          username: username.trim() || undefined,
          workspacePath: workspacePath.trim() || undefined,
          templateId: selectedTemplate?.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Failed to create agent (${res.status})`);
      setResult(data as AgentSetupResult);
      setStep("setup");
    } catch (err) {
      Alert.alert("Error", (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelegate = async () => {
    if (!result || !squadLeads[0]) return;
    setDelegateStatus("creating");
    try {
      const description = [
        `## Set up new agent: ${result.agent.name}`,
        "",
        `**Role:** ${result.agent.role}`,
        `**Level:** ${result.agent.level}`,
        `**Workspace:** \`${result.workspacePath}\``,
        "",
        "### Bootstrap Message",
        "",
        "```",
        result.bootstrapMessage,
        "```",
        "",
        "### Cron Command",
        "",
        "```",
        result.cronCommand,
        "```",
        "",
        "### API Key",
        "",
        `\`${result.apiKey}\``,
        "",
        "### OpenClaw Agent Config",
        "",
        "```json",
        JSON.stringify(result.openclawAgentConfig, null, 2),
        "```",
      ].join("\n");

      const res = await createTask({
        title: `Set up new agent: ${result.agent.name} (${result.agent.role})`,
        description,
        assigneeIds: [squadLeads[0].id],
        priority: "high",
        tags: ["agent-setup"],
      });

      if (res.error) throw new Error(res.error.message);
      const taskNumber = res.data?.createTaskFromDashboard?.taskNumber;
      setDelegateTaskNumber(taskNumber ?? null);
      setDelegateStatus("done");
    } catch (err) {
      Alert.alert("Error", (err as Error).message);
      setDelegateStatus("idle");
    }
  };

  const handleCloudDeploy = async () => {
    if (!result || !selectedVmId) return;
    setCloudDeploying(true);
    try {
      const res = await fetch(`${serverUrl}/api/cloud-vms/${selectedVmId}/agents`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ agentId: result.agent.id }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to deploy agent");
      }
      setCloudVmId(selectedVmId);
    } catch (err) {
      Alert.alert("Error", (err as Error).message);
    } finally {
      setCloudDeploying(false);
    }
  };

  const copyText = (text: string, label: string) => {
    Clipboard.setString(text);
    Alert.alert("Copied", `${label} copied to clipboard`);
  };

  const stepIndex = { template: 0, preview: 0, details: 1, setup: 2 }[step];

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-50 dark:bg-slate-900"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View
        className="flex-row items-center px-3 pb-2.5 bg-gray-50 dark:bg-slate-900 border-b border-gray-100 dark:border-slate-800 gap-2"
        style={{ paddingTop: insets.top + 8 }}
      >
        <TouchableOpacity
          onPress={() => {
            if (step === "preview") setStep("template");
            else if (step === "details") setStep(selectedTemplate ? "preview" : "template");
            else if (step === "setup") router.push("/(dashboard)/agents" as never);
            else router.back();
          }}
          className="w-10 h-10 justify-center"
        >
          <Ionicons name="chevron-back" size={22} color="#374151" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-lg font-bold text-gray-900 dark:text-slate-100">Create Agent</Text>
          <Text className="text-xs text-gray-400 dark:text-slate-500 mt-px">
            {step === "template" && "Choose a template"}
            {step === "preview" && "Template details"}
            {step === "details" && "Configure your agent"}
            {step === "setup" && "Setup instructions"}
          </Text>
        </View>
      </View>

      {/* Step indicators */}
      <View className="flex-row items-center justify-center py-3 bg-gray-50 dark:bg-slate-900">
        {[0, 1, 2].map((i) => (
          <View key={i} className="flex-row items-center">
            {i > 0 && <View className="w-8 h-px bg-gray-200 dark:bg-slate-700" />}
            <View
              className={[
                "w-7 h-7 rounded-full justify-center items-center border-[1.5px]",
                stepIndex === i
                  ? "bg-blue-600 border-blue-600"
                  : stepIndex > i
                  ? "bg-green-600 border-green-600"
                  : "bg-gray-100 dark:bg-slate-700 border-gray-200 dark:border-slate-600",
              ].join(" ")}
            >
              {stepIndex > i ? (
                <Ionicons name="checkmark" size={12} color="#fff" />
              ) : (
                <Text
                  className={[
                    "text-xs font-semibold",
                    stepIndex === i ? "text-white" : "text-gray-400 dark:text-slate-500",
                  ].join(" ")}
                >
                  {i + 1}
                </Text>
              )}
            </View>
          </View>
        ))}
      </View>

      {/* ── Step 1: Template List ── */}
      {step === "template" && (
        <View className="flex-1">
          <View className="flex-row items-center bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 px-3 py-2.5 mx-4 mt-3 mb-2">
            <Ionicons name="search-outline" size={16} color="#9ca3af" style={{ marginRight: 8 }} />
            <TextInput
              className="flex-1 text-sm text-gray-900 dark:text-slate-100"
              value={search}
              onChangeText={setSearch}
              placeholder="Search templates…"
              placeholderTextColor="#9ca3af"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Ionicons name="close-circle" size={16} color="#9ca3af" />
              </TouchableOpacity>
            )}
          </View>

          {/* Category chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 10, gap: 8, flexDirection: "row" }}
          >
            <TouchableOpacity
              className={[
                "border rounded-lg px-3.5 py-2",
                categoryFilter === "all"
                  ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20"
                  : "border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800",
              ].join(" ")}
              onPress={() => setCategoryFilter("all")}
            >
              <Text
                className={[
                  "text-sm font-medium",
                  categoryFilter === "all"
                    ? "text-blue-600 dark:text-blue-400 font-semibold"
                    : "text-gray-500 dark:text-slate-400",
                ].join(" ")}
              >
                All
              </Text>
            </TouchableOpacity>
            {categories.map((c) => (
              <TouchableOpacity
                key={c}
                className={[
                  "border rounded-lg px-3.5 py-2",
                  categoryFilter === c
                    ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20"
                    : "border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800",
                ].join(" ")}
                onPress={() => setCategoryFilter(c)}
              >
                <Text
                  className={[
                    "text-sm font-medium",
                    categoryFilter === c
                      ? "text-blue-600 dark:text-blue-400 font-semibold"
                      : "text-gray-500 dark:text-slate-400",
                  ].join(" ")}
                >
                  {CATEGORY_LABELS[c] ?? c}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <FlatList
            data={filteredTemplates}
            keyExtractor={(t) => t.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, gap: 8, paddingBottom: insets.bottom + 80 }}
            renderItem={({ item: t }) => (
              <TouchableOpacity
                className="flex-row items-center bg-white dark:bg-slate-800 rounded-xl p-3.5 border border-gray-200 dark:border-slate-700 gap-3"
                onPress={() => {
                  setSelectedTemplate(t);
                  setStep("preview");
                }}
                activeOpacity={0.75}
              >
                <Text className="text-2xl w-9 text-center">{t.emoji}</Text>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-gray-900 dark:text-slate-100">{t.name}</Text>
                  <Text className="text-xs text-gray-500 dark:text-slate-400 leading-4 mt-0.5" numberOfLines={2}>{t.description}</Text>
                  <Text className="text-xs text-blue-600 dark:text-blue-400 font-semibold mt-1 uppercase">
                    {CATEGORY_LABELS[t.category] ?? t.category}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View className="items-center pt-10">
                <Text className="text-sm text-gray-400 dark:text-slate-500">No templates found</Text>
              </View>
            }
          />

          {/* Start from scratch */}
          <View
            className="absolute bottom-0 left-0 right-0 bg-gray-50 dark:bg-slate-900 px-4 pt-3 border-t border-gray-200 dark:border-slate-700"
            style={{ paddingBottom: insets.bottom + 12 }}
          >
            <TouchableOpacity
              className="border border-gray-200 dark:border-slate-700 rounded-xl py-3.5 items-center bg-white dark:bg-slate-800"
              onPress={() => {
                setSelectedTemplate(null);
                setRole("");
                setEmoji(DEFAULT_AGENT_EMOJI);
                setPersonality("");
                setLevel(DEFAULT_AGENT_LEVEL);
                setStep("details");
              }}
              activeOpacity={0.8}
            >
              <Text className="text-base text-gray-700 dark:text-slate-300 font-medium">Start from Scratch</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Step 1.5: Template Preview ── */}
      {step === "preview" && selectedTemplate && (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 24 }}
          contentInsetAdjustmentBehavior="automatic"
        >
          <View className="flex-row items-start gap-3.5">
            <Text className="text-5xl">{selectedTemplate.emoji}</Text>
            <View className="flex-1">
              <Text className="text-xl font-extrabold text-gray-900 dark:text-slate-100">{selectedTemplate.name}</Text>
              <Text className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">{selectedTemplate.role}</Text>
            </View>
            <View className="bg-blue-50 dark:bg-blue-900/20 rounded-md px-2 py-1 self-start">
              <Text className="text-xs text-blue-600 dark:text-blue-400 font-semibold">
                {selectedTemplate.level.charAt(0).toUpperCase() + selectedTemplate.level.slice(1)}
              </Text>
            </View>
          </View>

          <View className="self-start bg-gray-100 dark:bg-slate-700 rounded-md px-2 py-1">
            <Text className="text-xs text-gray-500 dark:text-slate-400 font-medium">
              {CATEGORY_LABELS[selectedTemplate.category] ?? selectedTemplate.category}
            </Text>
          </View>

          {/* Description */}
          <Text className="text-sm text-gray-700 dark:text-slate-300 leading-5">{selectedTemplate.description}</Text>

          {/* Behavior */}
          {selectedTemplate.personality ? (
            <View className="bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-3.5 gap-1.5">
              <Text className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-[0.8px] mb-1">Behavior</Text>
              <Text className="text-sm text-gray-700 dark:text-slate-300 leading-5">{selectedTemplate.personality}</Text>
            </View>
          ) : null}

          {/* Skills */}
          {selectedTemplate.skills.length > 0 && (
            <View className="gap-2">
              <Text className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-[0.8px] mb-1">Pre-loaded Skills</Text>
              {selectedTemplate.skills.map((s, i) => (
                <View key={i} className="flex-row items-start gap-2">
                  <View className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                  <Text className="text-sm text-gray-700 dark:text-slate-300 flex-1 leading-5">{s}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Capabilities */}
          {selectedTemplate.capabilities.length > 0 && (
            <View className="gap-2">
              <Text className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-[0.8px] mb-1">Capabilities</Text>
              <View className="flex-row flex-wrap gap-2">
                {selectedTemplate.capabilities.map((c, i) => (
                  <View key={i} className="bg-gray-50 dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 px-2.5 py-1">
                    <Text className="text-xs text-gray-700 dark:text-slate-300">{c}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <TouchableOpacity
            className="bg-blue-600 rounded-xl py-3.5 items-center"
            onPress={() => applyTemplate(selectedTemplate)}
            activeOpacity={0.8}
          >
            <Text className="text-white text-base font-semibold">Use This Template</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ── Step 2: Details ── */}
      {step === "details" && (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 24 }}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
        >
          {selectedTemplate && (
            <View className="flex-row items-center bg-blue-50 dark:bg-blue-900/20 rounded-xl p-2.5 gap-2 border border-blue-200 dark:border-blue-800">
              <Text className="text-lg">{selectedTemplate.emoji}</Text>
              <Text className="flex-1 text-sm font-semibold text-blue-700 dark:text-blue-300">{selectedTemplate.name}</Text>
              <TouchableOpacity onPress={() => setStep("preview")}>
                <Text className="text-xs text-blue-600 dark:text-blue-400 font-medium">Change</Text>
              </TouchableOpacity>
            </View>
          )}

          <View className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-200 dark:border-slate-700 gap-3">
            <Text className="text-sm font-bold text-gray-900 dark:text-slate-100">Identity</Text>

            <View className="gap-1.5">
              <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">Name <Text className="text-red-600 dark:text-red-400">*</Text></Text>
              <TextInput
                className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-3.5 py-3 text-base text-gray-900 dark:text-slate-100"
                value={name}
                onChangeText={setName}
                placeholder="e.g. Nova, Rex, Luna"
                placeholderTextColor="#9ca3af"
                autoFocus
              />
            </View>

            <View className="gap-1.5">
              <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">Username <Text className="text-gray-400 dark:text-slate-500 font-normal">(optional)</Text></Text>
              <View className="flex-row items-center gap-1">
                <Text className="text-base text-gray-500 dark:text-slate-400 font-medium">@</Text>
                <TextInput
                  className="flex-1 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-3.5 py-3 text-base text-gray-900 dark:text-slate-100"
                  value={username}
                  onChangeText={(t) => setUsername(t.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder={
                    name
                      ? name.toLowerCase().replace(/[^a-z0-9]+/g, "-")
                      : "auto-generated"
                  }
                  placeholderTextColor="#9ca3af"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            <View className="gap-1.5">
              <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">Role <Text className="text-red-600 dark:text-red-400">*</Text></Text>
              <TextInput
                className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-3.5 py-3 text-base text-gray-900 dark:text-slate-100"
                value={role}
                onChangeText={setRole}
                placeholder="e.g. Research Specialist"
                placeholderTextColor="#9ca3af"
              />
            </View>

            <View className="gap-1.5">
              <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">Emoji</Text>
              <View className="flex-row flex-wrap gap-2">
                {AGENT_EMOJI_PRESETS.map((e) => (
                  <TouchableOpacity
                    key={e}
                    className={[
                      "w-11 h-11 rounded-xl border-[1.5px] justify-center items-center",
                      emoji === e
                        ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20"
                        : "border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900",
                    ].join(" ")}
                    onPress={() => setEmoji(e)}
                    activeOpacity={0.7}
                  >
                    <Text className="text-xl">{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <View className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-200 dark:border-slate-700 gap-3">
            <Text className="text-sm font-bold text-gray-900 dark:text-slate-100">Level</Text>
            <View className="flex-row gap-2 flex-wrap">
              {AGENT_LEVEL_KEYS.map((l) => (
                <TouchableOpacity
                  key={l}
                  className={[
                    "border rounded-lg px-3.5 py-2",
                    level === l
                      ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20"
                      : "border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800",
                  ].join(" ")}
                  onPress={() => setLevel(l)}
                  activeOpacity={0.7}
                >
                  <Text
                    className={[
                      "text-sm font-medium",
                      level === l
                        ? "text-blue-600 dark:text-blue-400 font-semibold"
                        : "text-gray-500 dark:text-slate-400",
                    ].join(" ")}
                  >
                    {l.charAt(0).toUpperCase() + l.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-200 dark:border-slate-700 gap-3">
            <Text className="text-sm font-bold text-gray-900 dark:text-slate-100">Instructions / Personality</Text>
            <Text className="text-xs text-gray-400 dark:text-slate-500">
              Behavior guidelines, expertise, and working style. Describe how this agent should act.
            </Text>
            <TextInput
              className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-3.5 py-3 text-base text-gray-900 dark:text-slate-100 min-h-28"
              value={personality}
              onChangeText={setPersonality}
              placeholder="Agent personality and behavior guidelines…"
              placeholderTextColor="#9ca3af"
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />
          </View>

          <View className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-200 dark:border-slate-700 gap-3">
            <Text className="text-sm font-bold text-gray-900 dark:text-slate-100">Workspace Path <Text className="text-gray-400 dark:text-slate-500 font-normal">(optional)</Text></Text>
            <Text className="text-xs text-gray-400 dark:text-slate-500">Leave blank to use the default OpenClaw workspace path.</Text>
            <TextInput
              className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-3.5 py-3 text-base text-gray-900 dark:text-slate-100"
              value={workspacePath}
              onChangeText={setWorkspacePath}
              placeholder={`~/.openclaw/agents/${name ? name.toLowerCase().replace(/[^a-z0-9]+/g, "-") : "agent-name"}/workspace`}
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <TouchableOpacity
            className={[
              "bg-blue-600 rounded-xl py-3.5 items-center",
              (!name.trim() || !role.trim() || loading) ? "opacity-45" : "",
            ].join(" ")}
            onPress={handleCreate}
            disabled={!name.trim() || !role.trim() || loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text className="text-white text-base font-semibold">Create Agent</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ── Step 3: Setup ── */}
      {step === "setup" && result && (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 32 }}
          contentInsetAdjustmentBehavior="automatic"
        >
          {/* Security warning */}
          <View className="flex-row gap-3 border-[1.5px] border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/20 rounded-xl p-3.5 items-start">
            <Ionicons name="shield-outline" size={20} color="#dc2626" />
            <View className="flex-1">
              <Text className="text-sm font-bold text-red-600 dark:text-red-400 mb-1">Sensitive Credentials</Text>
              <Text className="text-xs text-red-500 leading-5">
                The content below contains your API key. Do not share publicly or commit to version control.
              </Text>
            </View>
          </View>

          {/* Mode tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingVertical: 4, gap: 6, flexDirection: "row" }}
          >
            {(["auto", "manual", "delegate", "cloud"] as SetupMode[]).map((m) => {
              const icons: Record<SetupMode, keyof typeof Ionicons.glyphMap> = {
                auto: "send-outline",
                manual: "construct-outline",
                delegate: "hardware-chip-outline",
                cloud: "cloud-outline",
              };
              const disabled = m === "delegate" && squadLeads.length === 0;
              return (
                <TouchableOpacity
                  key={m}
                  className={[
                    "flex-row items-center gap-1 px-3 py-2 rounded-lg border",
                    setupMode === m
                      ? "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20"
                      : "border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800",
                    disabled ? "opacity-40" : "",
                  ].join(" ")}
                  onPress={async () => {
                    if (disabled) return;
                    setSetupMode(m);
                    if (m === "cloud" && cloudVms.length === 0) {
                      setCloudVmsLoading(true);
                      try {
                        const res = await fetch(`${serverUrl}/api/cloud-vms`, {
                          credentials: "include",
                          headers: authHeader(),
                        });
                        if (res.ok) {
                          const d = await res.json();
                          setCloudVms(
                            (d.vms || []).filter(
                              (vm: { status: string; llmConfigured: boolean }) =>
                                vm.status === "running" && vm.llmConfigured,
                            ),
                          );
                        }
                      } catch { /* ignore */ }
                      setCloudVmsLoading(false);
                    }
                  }}
                  activeOpacity={0.75}
                >
                  <Ionicons
                    name={icons[m]}
                    size={15}
                    color={setupMode === m ? "#2563eb" : "#6b7280"}
                  />
                  <Text
                    className={[
                      "text-xs font-medium",
                      setupMode === m
                        ? "text-blue-600 dark:text-blue-400 font-semibold"
                        : "text-gray-500 dark:text-slate-400",
                    ].join(" ")}
                  >
                    {SETUP_MODE_LABELS[m]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* ── AUTO MODE ── */}
          {setupMode === "auto" && (
            <>
              <View className="flex-row gap-3 border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3.5 items-start">
                <Ionicons name="chatbubble-ellipses-outline" size={18} color="#2563eb" />
                <View className="flex-1">
                  <Text className="text-sm font-bold text-blue-700 dark:text-blue-300 mb-1">Send to Your Connected Channel</Text>
                  <Text className="text-xs text-blue-500 leading-5">
                    Copy the bootstrap message and send it via WhatsApp, Slack, Discord, or Telegram. The agent will read it and configure itself automatically.
                  </Text>
                </View>
              </View>

              <View className="gap-2">
                <View className="flex-row justify-between items-center">
                  <Text className="text-sm font-semibold text-gray-900 dark:text-slate-100">Bootstrap Message</Text>
                  <TouchableOpacity
                    onPress={() => copyText(result.bootstrapMessage, "Bootstrap message")}
                    className="flex-row items-center gap-1"
                  >
                    <Ionicons name="copy-outline" size={14} color="#2563eb" />
                    <Text className="text-xs text-blue-600 dark:text-blue-400 font-medium">Copy</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView
                  horizontal
                  className="bg-gray-800 rounded-xl p-3 max-h-48"
                  contentContainerStyle={{ minWidth: "100%" }}
                >
                  <Text
                    className="text-xs text-emerald-100 leading-5"
                    style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}
                    selectable
                  >
                    {result.bootstrapMessage}
                  </Text>
                </ScrollView>
              </View>

              <View className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 gap-3">
                <Text className="text-sm font-bold text-gray-900 dark:text-slate-100">Steps</Text>
                {[
                  "Copy the bootstrap message above",
                  "Send it to your agent via any connected channel (WhatsApp, Slack, Discord, etc.)",
                  "Agent will appear in the dashboard on next heartbeat",
                ].map((s, i) => (
                  <View key={i} className="flex-row gap-2.5 items-start">
                    <View className="w-6 h-6 rounded-full bg-blue-50 dark:bg-blue-900/20 justify-center items-center shrink-0 mt-px">
                      <Text className="text-xs font-bold text-blue-600 dark:text-blue-400">{i + 1}</Text>
                    </View>
                    <Text className="text-sm text-gray-700 dark:text-slate-300 flex-1 leading-5">{s}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* ── MANUAL MODE ── */}
          {setupMode === "manual" && (
            <>
              {/* API Key */}
              <View className="flex-row gap-3 border-[1.5px] border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/10 rounded-xl p-3.5 items-start">
                <Ionicons name="warning-outline" size={18} color="#d97706" />
                <View className="flex-1">
                  <Text className="text-sm font-bold text-amber-600 mb-1">API Key — Save this now!</Text>
                  <Text className="text-xs text-amber-800 leading-5 mb-2">
                    This key will only be shown once. It is already embedded in the config files.
                  </Text>
                  <View className="flex-row items-center gap-1.5 bg-white dark:bg-slate-800 rounded-lg p-2.5 border border-amber-200 dark:border-amber-700">
                    <Text
                      className="flex-1 text-sm text-gray-900 dark:text-slate-100"
                      style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}
                      selectable
                      numberOfLines={apiKeyVisible ? undefined : 1}
                    >
                      {apiKeyVisible ? result.apiKey : "••••••••••••••••••••••••••••••••"}
                    </Text>
                    <TouchableOpacity onPress={() => setApiKeyVisible((v) => !v)} className="p-1">
                      <Ionicons
                        name={apiKeyVisible ? "eye-off-outline" : "eye-outline"}
                        size={17}
                        color="#6b7280"
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => copyText(result.apiKey, "API key")}
                      className="p-1"
                    >
                      <Ionicons name="copy-outline" size={17} color="#2563eb" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* 1. OpenClaw config */}
              <View className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-3.5 gap-2.5">
                <View className="flex-row items-center gap-1.5">
                  <Ionicons name="terminal-outline" size={16} color="#374151" />
                  <Text className="text-sm font-bold text-gray-900 dark:text-slate-100">1. Register Agent in OpenClaw</Text>
                </View>
                <Text className="text-xs text-gray-500 dark:text-slate-400 leading-5">
                  Add this to{" "}
                  <Text style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }} className="text-xs">agents.list</Text>
                  {" "}in{" "}
                  <Text style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }} className="text-xs">~/.openclaw/openclaw.json</Text>:
                </Text>
                <View className="bg-gray-800 rounded-lg p-3">
                  <Text
                    className="text-xs text-green-400 leading-5"
                    style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}
                    selectable
                  >
                    {JSON.stringify(result.openclawAgentConfig, null, 2)}
                  </Text>
                </View>
                <TouchableOpacity
                  className="flex-row items-center gap-1"
                  onPress={() => copyText(JSON.stringify(result.openclawAgentConfig, null, 2), "Agent config")}
                >
                  <Ionicons name="copy-outline" size={13} color="#2563eb" />
                  <Text className="text-xs text-blue-600 dark:text-blue-400 font-medium">Copy config</Text>
                </TouchableOpacity>
              </View>

              {/* 2. Workspace */}
              <View className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-3.5 gap-2.5">
                <View className="flex-row items-center gap-1.5">
                  <Ionicons name="folder-outline" size={16} color="#374151" />
                  <Text className="text-sm font-bold text-gray-900 dark:text-slate-100">2. Create Workspace</Text>
                </View>
                <View className="bg-gray-800 rounded-lg p-3">
                  <Text
                    className="text-xs text-green-400 leading-5"
                    style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}
                    selectable
                  >{`mkdir -p ${result.workspacePath}`}</Text>
                </View>
                <TouchableOpacity
                  className="flex-row items-center gap-1"
                  onPress={() => copyText(`mkdir -p ${result.workspacePath}`, "mkdir command")}
                >
                  <Ionicons name="copy-outline" size={13} color="#2563eb" />
                  <Text className="text-xs text-blue-600 dark:text-blue-400 font-medium">Copy command</Text>
                </TouchableOpacity>
              </View>

              {/* 3. Config files */}
              <View className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-3.5 gap-2.5">
                <Text className="text-sm font-bold text-gray-900 dark:text-slate-100">3. Config Files</Text>
                <Text className="text-xs text-gray-500 dark:text-slate-400 leading-5">
                  Copy each file to{" "}
                  <Text style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }} className="text-xs">{result.workspacePath}/</Text>
                </Text>
                {result.configFiles.map((file) => (
                  <View key={file.filename} className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden">
                    <View className="flex-row items-center gap-2 px-3 py-2.5 bg-gray-50 dark:bg-slate-900">
                      <Ionicons name="document-text-outline" size={14} color="#374151" />
                      <Text className="flex-1 text-sm font-medium text-gray-700 dark:text-slate-300">{file.filename}</Text>
                      <TouchableOpacity
                        onPress={() => copyText(file.content, file.filename)}
                        className="flex-row items-center gap-1"
                      >
                        <Ionicons name="copy-outline" size={13} color="#2563eb" />
                        <Text className="text-xs text-blue-600 dark:text-blue-400 font-medium">Copy</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>

              {/* 4. Cron */}
              <View className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-3.5 gap-2.5">
                <View className="flex-row items-center gap-1.5">
                  <Ionicons name="terminal-outline" size={16} color="#374151" />
                  <Text className="text-sm font-bold text-gray-900 dark:text-slate-100">4. Add Heartbeat Cron</Text>
                </View>
                <View className="bg-gray-800 rounded-lg p-3">
                  <Text
                    className="text-xs text-green-400 leading-5"
                    style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}
                    selectable
                  >{result.cronCommand}</Text>
                </View>
                <TouchableOpacity
                  className="flex-row items-center gap-1"
                  onPress={() => copyText(result.cronCommand, "Cron command")}
                >
                  <Ionicons name="copy-outline" size={13} color="#2563eb" />
                  <Text className="text-xs text-blue-600 dark:text-blue-400 font-medium">Copy cron command</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ── DELEGATE MODE ── */}
          {setupMode === "delegate" && (
            <>
              <View className="flex-row gap-3 border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20 rounded-xl p-3.5 items-start">
                <Ionicons name="hardware-chip-outline" size={18} color="#16a34a" />
                <View className="flex-1">
                  <Text className="text-sm font-bold text-green-700 dark:text-green-400 mb-1">Delegate Setup to Squad Lead</Text>
                  <Text className="text-xs text-green-600 dark:text-green-500 leading-5">
                    A high-priority task will be created and assigned to your Squad Lead. It will bootstrap the workspace and set up the heartbeat cron on next wake-up.
                  </Text>
                </View>
              </View>

              {delegateStatus !== "done" && (
                <>
                  <View className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-3.5 gap-2">
                    <Text className="text-sm font-bold text-gray-700 dark:text-slate-300 mb-1">Task will include</Text>
                    <View className="flex-row gap-2">
                      <Text className="text-sm text-gray-500 dark:text-slate-400 w-20">Name</Text>
                      <Text className="text-sm font-semibold text-gray-900 dark:text-slate-100 flex-1">{result.agent.name}</Text>
                    </View>
                    <View className="flex-row gap-2">
                      <Text className="text-sm text-gray-500 dark:text-slate-400 w-20">Role</Text>
                      <Text className="text-sm font-semibold text-gray-900 dark:text-slate-100 flex-1">{result.agent.role}</Text>
                    </View>
                    <View className="flex-row gap-2">
                      <Text className="text-sm text-gray-500 dark:text-slate-400 w-20">Level</Text>
                      <Text className="text-sm font-semibold text-gray-900 dark:text-slate-100 flex-1">{result.agent.level}</Text>
                    </View>
                    <View className="flex-row gap-2">
                      <Text className="text-sm text-gray-500 dark:text-slate-400 w-20">Assigned to</Text>
                      <Text className="text-sm font-semibold text-gray-900 dark:text-slate-100 flex-1">{squadLeads[0]?.name ?? SQUAD_LEAD_ROLE}</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    className={[
                      "bg-blue-600 rounded-xl py-3.5 items-center",
                      delegateStatus === "creating" ? "opacity-45" : "",
                    ].join(" ")}
                    onPress={handleDelegate}
                    disabled={delegateStatus === "creating"}
                    activeOpacity={0.8}
                  >
                    {delegateStatus === "creating" ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text className="text-white text-base font-semibold">Create Setup Task</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {delegateStatus === "done" && delegateTaskNumber !== null && (
                <View className="flex-row gap-3 border-[1.5px] border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20 rounded-xl p-3.5 items-start">
                  <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-green-700 dark:text-green-400 mb-0.5">Task #{delegateTaskNumber} Created</Text>
                    <Text className="text-xs text-green-600 dark:text-green-500 leading-5">
                      Assigned to {squadLeads[0]?.name ?? SQUAD_LEAD_ROLE}. Setup will happen on next wake-up.
                    </Text>
                  </View>
                </View>
              )}
            </>
          )}

          {/* ── CLOUD MODE ── */}
          {setupMode === "cloud" && (
            <>
              <View
                className="flex-row gap-3 rounded-xl p-3.5 items-start border"
                style={{ borderColor: "#e9d5ff", backgroundColor: "#faf5ff" }}
              >
                <Ionicons name="cloud-outline" size={18} color="#9333ea" />
                <View className="flex-1">
                  <Text className="text-sm font-bold mb-1" style={{ color: "#6b21a8" }}>Host on Cloud VM</Text>
                  <Text className="text-xs leading-5" style={{ color: "#7c3aed" }}>
                    Deploy this agent to one of your cloud VMs. The VM will automatically set up and start the agent.
                  </Text>
                </View>
              </View>

              {cloudVmId ? (
                <View className="flex-row gap-3 border-[1.5px] border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20 rounded-xl p-3.5 items-start">
                  <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-green-700 dark:text-green-400 mb-0.5">Agent Deployed</Text>
                    <Text className="text-xs text-green-600 dark:text-green-500 leading-5">
                      The VM is setting up your agent. You'll see it come online once it sends its first heartbeat.
                    </Text>
                  </View>
                </View>
              ) : cloudVmsLoading ? (
                <View className="flex-row items-center gap-2.5 py-4">
                  <ActivityIndicator size="small" color="#9333ea" />
                  <Text className="text-sm text-purple-600">Loading VMs…</Text>
                </View>
              ) : cloudVms.length === 0 ? (
                <View className="items-center py-6 gap-2">
                  <Ionicons name="server-outline" size={32} color="#d1d5db" />
                  <Text className="text-sm text-gray-700 dark:text-slate-300 font-medium">No running VMs with LLM configured</Text>
                  <Text className="text-xs text-gray-400 dark:text-slate-500 text-center">
                    Create and configure a VM on the Cloud page first
                  </Text>
                </View>
              ) : (
                <>
                  <View className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-200 dark:border-slate-700 gap-3">
                    <Text className="text-sm font-bold text-gray-900 dark:text-slate-100">Select a VM</Text>
                    {cloudVms.map((vm) => (
                      <TouchableOpacity
                        key={vm.id}
                        className={[
                          "flex-row items-center border rounded-xl p-3 gap-2.5",
                          selectedVmId === vm.id
                            ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20"
                            : "border-gray-200 dark:border-slate-700",
                        ].join(" ")}
                        onPress={() => setSelectedVmId(vm.id)}
                        activeOpacity={0.75}
                      >
                        <View className="w-6">
                          {selectedVmId === vm.id && (
                            <Ionicons name="checkmark-circle" size={18} color="#2563eb" />
                          )}
                          {selectedVmId !== vm.id && (
                            <View className="w-5 h-5 rounded-full border-[1.5px] border-gray-300 dark:border-slate-500" />
                          )}
                        </View>
                        <View className="flex-1">
                          <Text className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                            {vm.name || vm.serverName || vm.id.slice(0, 8)}
                          </Text>
                          <Text className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                            {vm.serverType} / {vm.region}
                            {vm.ipv4 ? ` · ${vm.ipv4}` : ""}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {selectedVmId && (
                    <TouchableOpacity
                      className={[
                        "bg-blue-600 rounded-xl py-3.5 items-center",
                        cloudDeploying ? "opacity-45" : "",
                      ].join(" ")}
                      onPress={handleCloudDeploy}
                      disabled={cloudDeploying}
                      activeOpacity={0.8}
                    >
                      {cloudDeploying ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text className="text-white text-base font-semibold">Deploy to VM</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </>
              )}
            </>
          )}

          {/* Done */}
          <TouchableOpacity
            className="border border-gray-200 dark:border-slate-700 rounded-xl py-3.5 items-center bg-white dark:bg-slate-800"
            onPress={() => router.push(`/agent/${result.agent.id}` as never)}
            activeOpacity={0.8}
          >
            <Text className="text-base text-gray-700 dark:text-slate-300 font-medium">View Agent Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="items-center py-2.5"
            onPress={() => router.push("/(dashboard)/agents" as never)}
            activeOpacity={0.7}
          >
            <Text className="text-sm text-gray-400 dark:text-slate-500">Back to Agents</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}
