import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
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
      style={{ flex: 1, backgroundColor: "#f9fafb" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => {
            if (step === "preview") setStep("template");
            else if (step === "details") setStep(selectedTemplate ? "preview" : "template");
            else if (step === "setup") router.push("/(dashboard)/agents" as never);
            else router.back();
          }}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color="#374151" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Create Agent</Text>
          <Text style={styles.headerSub}>
            {step === "template" && "Choose a template"}
            {step === "preview" && "Template details"}
            {step === "details" && "Configure your agent"}
            {step === "setup" && "Setup instructions"}
          </Text>
        </View>
      </View>

      {/* Step indicators */}
      <View style={styles.stepRow}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.stepIndicatorItem}>
            {i > 0 && <View style={styles.stepLine} />}
            <View
              style={[
                styles.stepDot,
                stepIndex === i && styles.stepDotActive,
                stepIndex > i && styles.stepDotDone,
              ]}
            >
              {stepIndex > i ? (
                <Ionicons name="checkmark" size={12} color="#fff" />
              ) : (
                <Text style={[styles.stepDotText, stepIndex === i && { color: "#fff" }]}>
                  {i + 1}
                </Text>
              )}
            </View>
          </View>
        ))}
      </View>

      {/* ── Step 1: Template List ── */}
      {step === "template" && (
        <View style={{ flex: 1 }}>
          <View style={styles.searchContainer}>
            <Ionicons name="search-outline" size={16} color="#9ca3af" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
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
            contentContainerStyle={styles.categoryChips}
          >
            <TouchableOpacity
              style={[styles.chip, categoryFilter === "all" && styles.chipActive]}
              onPress={() => setCategoryFilter("all")}
            >
              <Text style={[styles.chipText, categoryFilter === "all" && styles.chipTextActive]}>
                All
              </Text>
            </TouchableOpacity>
            {categories.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.chip, categoryFilter === c && styles.chipActive]}
                onPress={() => setCategoryFilter(c)}
              >
                <Text style={[styles.chipText, categoryFilter === c && styles.chipTextActive]}>
                  {CATEGORY_LABELS[c] ?? c}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <FlatList
            data={filteredTemplates}
            keyExtractor={(t) => t.id}
            contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 80 }]}
            renderItem={({ item: t }) => (
              <TouchableOpacity
                style={styles.templateCard}
                onPress={() => {
                  setSelectedTemplate(t);
                  setStep("preview");
                }}
                activeOpacity={0.75}
              >
                <Text style={styles.templateEmoji}>{t.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.templateName}>{t.name}</Text>
                  <Text style={styles.templateDesc} numberOfLines={2}>{t.description}</Text>
                  <Text style={styles.templateCategory}>
                    {CATEGORY_LABELS[t.category] ?? t.category}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No templates found</Text>
              </View>
            }
          />

          {/* Start from scratch */}
          <View style={[styles.floatingFooter, { paddingBottom: insets.bottom + 12 }]}>
            <TouchableOpacity
              style={styles.secondaryBtn}
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
              <Text style={styles.secondaryBtnText}>Start from Scratch</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Step 1.5: Template Preview ── */}
      {step === "preview" && selectedTemplate && (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          contentInsetAdjustmentBehavior="automatic"
        >
          <View style={styles.previewHeader}>
            <Text style={styles.previewEmoji}>{selectedTemplate.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.previewName}>{selectedTemplate.name}</Text>
              <Text style={styles.previewRole}>{selectedTemplate.role}</Text>
            </View>
            <View style={styles.levelBadge}>
              <Text style={styles.levelBadgeText}>
                {selectedTemplate.level.charAt(0).toUpperCase() + selectedTemplate.level.slice(1)}
              </Text>
            </View>
          </View>

          <View style={styles.categoryTag}>
            <Text style={styles.categoryTagText}>
              {CATEGORY_LABELS[selectedTemplate.category] ?? selectedTemplate.category}
            </Text>
          </View>

          {/* Description */}
          <Text style={styles.previewDesc}>{selectedTemplate.description}</Text>

          {/* Behavior */}
          {selectedTemplate.personality ? (
            <View style={styles.behaviorBox}>
              <Text style={styles.sectionLabel}>Behavior</Text>
              <Text style={styles.behaviorText}>{selectedTemplate.personality}</Text>
            </View>
          ) : null}

          {/* Skills */}
          {selectedTemplate.skills.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Pre-loaded Skills</Text>
              {selectedTemplate.skills.map((s, i) => (
                <View key={i} style={styles.skillRow}>
                  <View style={styles.skillDot} />
                  <Text style={styles.skillText}>{s}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Capabilities */}
          {selectedTemplate.capabilities.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Capabilities</Text>
              <View style={styles.capabilityWrap}>
                {selectedTemplate.capabilities.map((c, i) => (
                  <View key={i} style={styles.capBadge}>
                    <Text style={styles.capBadgeText}>{c}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => applyTemplate(selectedTemplate)}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryBtnText}>Use This Template</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ── Step 2: Details ── */}
      {step === "details" && (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
        >
          {selectedTemplate && (
            <View style={styles.templatePill}>
              <Text style={styles.templatePillEmoji}>{selectedTemplate.emoji}</Text>
              <Text style={styles.templatePillText}>{selectedTemplate.name}</Text>
              <TouchableOpacity onPress={() => setStep("preview")}>
                <Text style={styles.templatePillChange}>Change</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Identity</Text>

            <View style={styles.field}>
              <Text style={styles.label}>Name <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Nova, Rex, Luna"
                placeholderTextColor="#9ca3af"
                autoFocus
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Username <Text style={styles.optional}>(optional)</Text></Text>
              <View style={styles.usernameRow}>
                <Text style={styles.usernameAt}>@</Text>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
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

            <View style={styles.field}>
              <Text style={styles.label}>Role <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={styles.input}
                value={role}
                onChangeText={setRole}
                placeholder="e.g. Research Specialist"
                placeholderTextColor="#9ca3af"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Emoji</Text>
              <View style={styles.emojiGrid}>
                {AGENT_EMOJI_PRESETS.map((e) => (
                  <TouchableOpacity
                    key={e}
                    style={[styles.emojiBtn, emoji === e && styles.emojiBtnActive]}
                    onPress={() => setEmoji(e)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.emojiChar}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Level</Text>
            <View style={styles.chipRow}>
              {AGENT_LEVEL_KEYS.map((l) => (
                <TouchableOpacity
                  key={l}
                  style={[styles.chip, level === l && styles.chipActive]}
                  onPress={() => setLevel(l)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, level === l && styles.chipTextActive]}>
                    {l.charAt(0).toUpperCase() + l.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Instructions / Personality</Text>
            <Text style={styles.hint}>
              Behavior guidelines, expertise, and working style. Describe how this agent should act.
            </Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={personality}
              onChangeText={setPersonality}
              placeholder="Agent personality and behavior guidelines…"
              placeholderTextColor="#9ca3af"
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Workspace Path <Text style={styles.optional}>(optional)</Text></Text>
            <Text style={styles.hint}>Leave blank to use the default OpenClaw workspace path.</Text>
            <TextInput
              style={styles.input}
              value={workspacePath}
              onChangeText={setWorkspacePath}
              placeholder={`~/.openclaw/agents/${name ? name.toLowerCase().replace(/[^a-z0-9]+/g, "-") : "agent-name"}/workspace`}
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, (!name.trim() || !role.trim() || loading) && styles.primaryBtnDisabled]}
            onPress={handleCreate}
            disabled={!name.trim() || !role.trim() || loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.primaryBtnText}>Create Agent</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ── Step 3: Setup ── */}
      {step === "setup" && result && (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          contentInsetAdjustmentBehavior="automatic"
        >
          {/* Security warning */}
          <View style={styles.dangerBox}>
            <Ionicons name="shield-outline" size={20} color="#dc2626" />
            <View style={{ flex: 1 }}>
              <Text style={styles.dangerBoxTitle}>Sensitive Credentials</Text>
              <Text style={styles.dangerBoxText}>
                The content below contains your API key. Do not share publicly or commit to version control.
              </Text>
            </View>
          </View>

          {/* Mode tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.modeTabs}
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
                  style={[
                    styles.modeTab,
                    setupMode === m && styles.modeTabActive,
                    disabled && { opacity: 0.4 },
                  ]}
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
                  <Text style={[styles.modeTabText, setupMode === m && styles.modeTabTextActive]}>
                    {SETUP_MODE_LABELS[m]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* ── AUTO MODE ── */}
          {setupMode === "auto" && (
            <>
              <View style={styles.infoBox}>
                <Ionicons name="chatbubble-ellipses-outline" size={18} color="#2563eb" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoBoxTitle}>Send to Your Connected Channel</Text>
                  <Text style={styles.infoBoxText}>
                    Copy the bootstrap message and send it via WhatsApp, Slack, Discord, or Telegram. The agent will read it and configure itself automatically.
                  </Text>
                </View>
              </View>

              <View style={styles.codeSection}>
                <View style={styles.codeSectionHeader}>
                  <Text style={styles.codeSectionTitle}>Bootstrap Message</Text>
                  <TouchableOpacity
                    onPress={() => copyText(result.bootstrapMessage, "Bootstrap message")}
                    style={styles.copyBtn}
                  >
                    <Ionicons name="copy-outline" size={14} color="#2563eb" />
                    <Text style={styles.copyBtnText}>Copy</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView
                  horizontal
                  style={styles.codeBox}
                  contentContainerStyle={{ minWidth: "100%" }}
                >
                  <Text style={styles.codeText} selectable>{result.bootstrapMessage}</Text>
                </ScrollView>
              </View>

              <View style={styles.stepsBox}>
                <Text style={styles.stepsTitle}>Steps</Text>
                {[
                  "Copy the bootstrap message above",
                  "Send it to your agent via any connected channel (WhatsApp, Slack, Discord, etc.)",
                  "Agent will appear in the dashboard on next heartbeat",
                ].map((s, i) => (
                  <View key={i} style={styles.stepItem}>
                    <View style={styles.stepBubble}><Text style={styles.stepBubbleText}>{i + 1}</Text></View>
                    <Text style={styles.stepItemText}>{s}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* ── MANUAL MODE ── */}
          {setupMode === "manual" && (
            <>
              {/* API Key */}
              <View style={styles.warningBox}>
                <Ionicons name="warning-outline" size={18} color="#d97706" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.warningBoxTitle}>API Key — Save this now!</Text>
                  <Text style={styles.warningBoxText}>
                    This key will only be shown once. It is already embedded in the config files.
                  </Text>
                  <View style={styles.apiKeyRow}>
                    <Text style={styles.apiKeyText} selectable numberOfLines={apiKeyVisible ? undefined : 1}>
                      {apiKeyVisible ? result.apiKey : "••••••••••••••••••••••••••••••••"}
                    </Text>
                    <TouchableOpacity onPress={() => setApiKeyVisible((v) => !v)} style={styles.iconBtn}>
                      <Ionicons
                        name={apiKeyVisible ? "eye-off-outline" : "eye-outline"}
                        size={17}
                        color="#6b7280"
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => copyText(result.apiKey, "API key")}
                      style={styles.iconBtn}
                    >
                      <Ionicons name="copy-outline" size={17} color="#2563eb" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* 1. OpenClaw config */}
              <View style={styles.setupStep}>
                <View style={styles.setupStepHeader}>
                  <Ionicons name="terminal-outline" size={16} color="#374151" />
                  <Text style={styles.setupStepTitle}>1. Register Agent in OpenClaw</Text>
                </View>
                <Text style={styles.setupStepHint}>
                  Add this to <Text style={styles.mono}>agents.list</Text> in{" "}
                  <Text style={styles.mono}>~/.openclaw/openclaw.json</Text>:
                </Text>
                <View style={styles.codeBlock}>
                  <Text style={styles.codeGreen} selectable>
                    {JSON.stringify(result.openclawAgentConfig, null, 2)}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.copyRow}
                  onPress={() => copyText(JSON.stringify(result.openclawAgentConfig, null, 2), "Agent config")}
                >
                  <Ionicons name="copy-outline" size={13} color="#2563eb" />
                  <Text style={styles.copyRowText}>Copy config</Text>
                </TouchableOpacity>
              </View>

              {/* 2. Workspace */}
              <View style={styles.setupStep}>
                <View style={styles.setupStepHeader}>
                  <Ionicons name="folder-outline" size={16} color="#374151" />
                  <Text style={styles.setupStepTitle}>2. Create Workspace</Text>
                </View>
                <View style={styles.codeBlock}>
                  <Text style={styles.codeGreen} selectable>{`mkdir -p ${result.workspacePath}`}</Text>
                </View>
                <TouchableOpacity
                  style={styles.copyRow}
                  onPress={() => copyText(`mkdir -p ${result.workspacePath}`, "mkdir command")}
                >
                  <Ionicons name="copy-outline" size={13} color="#2563eb" />
                  <Text style={styles.copyRowText}>Copy command</Text>
                </TouchableOpacity>
              </View>

              {/* 3. Config files */}
              <View style={styles.setupStep}>
                <Text style={styles.setupStepTitle}>3. Config Files</Text>
                <Text style={styles.setupStepHint}>
                  Copy each file to <Text style={styles.mono}>{result.workspacePath}/</Text>
                </Text>
                {result.configFiles.map((file) => (
                  <View key={file.filename} style={styles.configFileCard}>
                    <View style={styles.configFileHeader}>
                      <Ionicons name="document-text-outline" size={14} color="#374151" />
                      <Text style={styles.configFileName}>{file.filename}</Text>
                      <TouchableOpacity
                        onPress={() => copyText(file.content, file.filename)}
                        style={styles.configFileCopy}
                      >
                        <Ionicons name="copy-outline" size={13} color="#2563eb" />
                        <Text style={styles.copyRowText}>Copy</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>

              {/* 4. Cron */}
              <View style={styles.setupStep}>
                <View style={styles.setupStepHeader}>
                  <Ionicons name="terminal-outline" size={16} color="#374151" />
                  <Text style={styles.setupStepTitle}>4. Add Heartbeat Cron</Text>
                </View>
                <View style={styles.codeBlock}>
                  <Text style={styles.codeGreen} selectable>{result.cronCommand}</Text>
                </View>
                <TouchableOpacity
                  style={styles.copyRow}
                  onPress={() => copyText(result.cronCommand, "Cron command")}
                >
                  <Ionicons name="copy-outline" size={13} color="#2563eb" />
                  <Text style={styles.copyRowText}>Copy cron command</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ── DELEGATE MODE ── */}
          {setupMode === "delegate" && (
            <>
              <View style={styles.successBox}>
                <Ionicons name="hardware-chip-outline" size={18} color="#16a34a" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.successBoxTitle}>Delegate Setup to Squad Lead</Text>
                  <Text style={styles.successBoxText}>
                    A high-priority task will be created and assigned to your Squad Lead. It will bootstrap the workspace and set up the heartbeat cron on next wake-up.
                  </Text>
                </View>
              </View>

              {delegateStatus !== "done" && (
                <>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryTitle}>Task will include</Text>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Name</Text>
                      <Text style={styles.summaryValue}>{result.agent.name}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Role</Text>
                      <Text style={styles.summaryValue}>{result.agent.role}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Level</Text>
                      <Text style={styles.summaryValue}>{result.agent.level}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Assigned to</Text>
                      <Text style={styles.summaryValue}>{squadLeads[0]?.name ?? SQUAD_LEAD_ROLE}</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.primaryBtn, delegateStatus === "creating" && styles.primaryBtnDisabled]}
                    onPress={handleDelegate}
                    disabled={delegateStatus === "creating"}
                    activeOpacity={0.8}
                  >
                    {delegateStatus === "creating" ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Create Setup Task</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {delegateStatus === "done" && delegateTaskNumber !== null && (
                <View style={styles.doneBox}>
                  <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.doneBoxTitle}>Task #{delegateTaskNumber} Created</Text>
                    <Text style={styles.doneBoxText}>
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
              <View style={[styles.infoBox, { borderColor: "#e9d5ff", backgroundColor: "#faf5ff" }]}>
                <Ionicons name="cloud-outline" size={18} color="#9333ea" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.infoBoxTitle, { color: "#6b21a8" }]}>Host on Cloud VM</Text>
                  <Text style={[styles.infoBoxText, { color: "#7c3aed" }]}>
                    Deploy this agent to one of your cloud VMs. The VM will automatically set up and start the agent.
                  </Text>
                </View>
              </View>

              {cloudVmId ? (
                <View style={styles.doneBox}>
                  <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.doneBoxTitle}>Agent Deployed</Text>
                    <Text style={styles.doneBoxText}>
                      The VM is setting up your agent. You'll see it come online once it sends its first heartbeat.
                    </Text>
                  </View>
                </View>
              ) : cloudVmsLoading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color="#9333ea" />
                  <Text style={styles.loadingText}>Loading VMs…</Text>
                </View>
              ) : cloudVms.length === 0 ? (
                <View style={styles.emptyVms}>
                  <Ionicons name="server-outline" size={32} color="#d1d5db" />
                  <Text style={styles.emptyVmsText}>No running VMs with LLM configured</Text>
                  <Text style={styles.emptyVmsHint}>
                    Create and configure a VM on the Cloud page first
                  </Text>
                </View>
              ) : (
                <>
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Select a VM</Text>
                    {cloudVms.map((vm) => (
                      <TouchableOpacity
                        key={vm.id}
                        style={[
                          styles.vmCard,
                          selectedVmId === vm.id && styles.vmCardActive,
                        ]}
                        onPress={() => setSelectedVmId(vm.id)}
                        activeOpacity={0.75}
                      >
                        <View style={styles.vmCardCheck}>
                          {selectedVmId === vm.id && (
                            <Ionicons name="checkmark-circle" size={18} color="#2563eb" />
                          )}
                          {selectedVmId !== vm.id && (
                            <View style={styles.vmCardEmptyCheck} />
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.vmName}>
                            {vm.name || vm.serverName || vm.id.slice(0, 8)}
                          </Text>
                          <Text style={styles.vmMeta}>
                            {vm.serverType} / {vm.region}
                            {vm.ipv4 ? ` · ${vm.ipv4}` : ""}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {selectedVmId && (
                    <TouchableOpacity
                      style={[styles.primaryBtn, cloudDeploying && styles.primaryBtnDisabled]}
                      onPress={handleCloudDeploy}
                      disabled={cloudDeploying}
                      activeOpacity={0.8}
                    >
                      {cloudDeploying ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.primaryBtnText}>Deploy to VM</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </>
              )}
            </>
          )}

          {/* Done */}
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => router.push(`/agent/${result.agent.id}` as never)}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryBtnText}>View Agent Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.ghostBtn}
            onPress={() => router.push("/(dashboard)/agents" as never)}
            activeOpacity={0.7}
          >
            <Text style={styles.ghostBtnText}>Back to Agents</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: "#f9fafb",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    gap: 8,
  },
  backBtn: { width: 40, height: 40, justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "700", color: "#111827" },
  headerSub: { fontSize: 12, color: "#9ca3af", marginTop: 1 },

  // Step indicators
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    backgroundColor: "#f9fafb",
    gap: 0,
  },
  stepIndicatorItem: { flexDirection: "row", alignItems: "center" },
  stepLine: { width: 32, height: 1, backgroundColor: "#e5e7eb" },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
  },
  stepDotActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  stepDotDone: { backgroundColor: "#16a34a", borderColor: "#16a34a" },
  stepDotText: { fontSize: 12, fontWeight: "600", color: "#9ca3af" },

  // Template list
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: "#111827" },
  categoryChips: { paddingHorizontal: 16, paddingBottom: 10, gap: 8, flexDirection: "row" },
  listContent: { paddingHorizontal: 16, paddingTop: 4, gap: 8 },
  templateCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 12,
  },
  templateEmoji: { fontSize: 24, width: 34, textAlign: "center" },
  templateName: { fontSize: 14, fontWeight: "600", color: "#111827" },
  templateDesc: { fontSize: 12, color: "#6b7280", lineHeight: 17, marginTop: 2 },
  templateCategory: { fontSize: 10, color: "#2563eb", fontWeight: "600", marginTop: 3, textTransform: "uppercase" },
  empty: { alignItems: "center", paddingTop: 40 },
  emptyText: { fontSize: 14, color: "#9ca3af" },
  floatingFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#f9fafb",
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },

  // Template preview
  content: { padding: 16, gap: 14 },
  previewHeader: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  previewEmoji: { fontSize: 44 },
  previewName: { fontSize: 20, fontWeight: "800", color: "#111827" },
  previewRole: { fontSize: 13, color: "#6b7280", marginTop: 2 },
  levelBadge: {
    backgroundColor: "#eff6ff",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  levelBadgeText: { fontSize: 11, color: "#2563eb", fontWeight: "600" },
  categoryTag: {
    alignSelf: "flex-start",
    backgroundColor: "#f3f4f6",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  categoryTagText: { fontSize: 11, color: "#6b7280", fontWeight: "500" },
  previewDesc: { fontSize: 14, color: "#374151", lineHeight: 21 },
  behaviorBox: {
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
    gap: 6,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  behaviorText: { fontSize: 13, color: "#374151", lineHeight: 20 },
  section: { gap: 8 },
  skillRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  skillDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#60a5fa", marginTop: 6, flexShrink: 0 },
  skillText: { fontSize: 13, color: "#374151", flex: 1, lineHeight: 19 },
  capabilityWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  capBadge: {
    backgroundColor: "#f9fafb",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  capBadgeText: { fontSize: 12, color: "#374151" },

  // Details form
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 12,
  },
  cardTitle: { fontSize: 14, fontWeight: "700", color: "#111827" },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: "600", color: "#374151" },
  required: { color: "#dc2626" },
  optional: { color: "#9ca3af", fontWeight: "400" },
  hint: { fontSize: 12, color: "#9ca3af" },
  input: {
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: "#111827",
  },
  textArea: { minHeight: 110, paddingTop: 11 },
  usernameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  usernameAt: { fontSize: 15, color: "#6b7280", fontWeight: "500" },
  emojiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  emojiBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f9fafb",
  },
  emojiBtnActive: { borderColor: "#2563eb", backgroundColor: "#eff6ff" },
  emojiChar: { fontSize: 22 },
  chipRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  chipActive: { borderColor: "#2563eb", backgroundColor: "#eff6ff" },
  chipText: { fontSize: 13, color: "#6b7280", fontWeight: "500" },
  chipTextActive: { color: "#2563eb", fontWeight: "600" },
  templatePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eff6ff",
    borderRadius: 10,
    padding: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  templatePillEmoji: { fontSize: 18 },
  templatePillText: { flex: 1, fontSize: 13, fontWeight: "600", color: "#1d4ed8" },
  templatePillChange: { fontSize: 12, color: "#2563eb", fontWeight: "500" },

  // Buttons
  primaryBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  secondaryBtnText: { fontSize: 15, color: "#374151", fontWeight: "500" },
  ghostBtn: { alignItems: "center", paddingVertical: 10 },
  ghostBtnText: { fontSize: 14, color: "#9ca3af" },

  // Setup step
  dangerBox: {
    flexDirection: "row",
    gap: 12,
    borderWidth: 1.5,
    borderColor: "#fca5a5",
    backgroundColor: "#fff1f2",
    borderRadius: 12,
    padding: 14,
    alignItems: "flex-start",
  },
  dangerBoxTitle: { fontSize: 14, fontWeight: "700", color: "#dc2626", marginBottom: 3 },
  dangerBoxText: { fontSize: 12, color: "#ef4444", lineHeight: 18 },

  modeTabs: { paddingVertical: 4, gap: 6, flexDirection: "row" },
  modeTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  modeTabActive: { borderColor: "#bfdbfe", backgroundColor: "#eff6ff" },
  modeTabText: { fontSize: 12, fontWeight: "500", color: "#6b7280" },
  modeTabTextActive: { color: "#2563eb", fontWeight: "600" },

  infoBox: {
    flexDirection: "row",
    gap: 12,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    borderRadius: 12,
    padding: 14,
    alignItems: "flex-start",
  },
  infoBoxTitle: { fontSize: 13, fontWeight: "700", color: "#1d4ed8", marginBottom: 3 },
  infoBoxText: { fontSize: 12, color: "#3b82f6", lineHeight: 18 },

  warningBox: {
    flexDirection: "row",
    gap: 12,
    borderWidth: 1.5,
    borderColor: "#fde68a",
    backgroundColor: "#fffbeb",
    borderRadius: 12,
    padding: 14,
    alignItems: "flex-start",
  },
  warningBoxTitle: { fontSize: 13, fontWeight: "700", color: "#d97706", marginBottom: 3 },
  warningBoxText: { fontSize: 12, color: "#92400e", lineHeight: 18, marginBottom: 8 },
  apiKeyRow: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#fff", borderRadius: 8, padding: 10, borderWidth: 1, borderColor: "#fde68a" },
  apiKeyText: { flex: 1, fontSize: 13, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", color: "#111827" },
  iconBtn: { padding: 4 },

  codeSection: { gap: 8 },
  codeSectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  codeSectionTitle: { fontSize: 14, fontWeight: "600", color: "#111827" },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  copyBtnText: { fontSize: 12, color: "#2563eb", fontWeight: "500" },
  codeBox: {
    backgroundColor: "#1f2937",
    borderRadius: 10,
    padding: 12,
    maxHeight: 200,
  },
  codeText: {
    fontSize: 11,
    color: "#d1fae5",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    lineHeight: 18,
  },

  stepsBox: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 16,
    gap: 12,
  },
  stepsTitle: { fontSize: 14, fontWeight: "700", color: "#111827" },
  stepItem: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  stepBubble: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#eff6ff", justifyContent: "center", alignItems: "center", flexShrink: 0, marginTop: 1 },
  stepBubbleText: { fontSize: 11, fontWeight: "700", color: "#2563eb" },
  stepItemText: { fontSize: 13, color: "#374151", flex: 1, lineHeight: 19 },

  setupStep: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
    gap: 10,
  },
  setupStepHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  setupStepTitle: { fontSize: 14, fontWeight: "700", color: "#111827" },
  setupStepHint: { fontSize: 12, color: "#6b7280", lineHeight: 18 },
  codeBlock: {
    backgroundColor: "#1f2937",
    borderRadius: 8,
    padding: 12,
  },
  codeGreen: {
    fontSize: 11,
    color: "#4ade80",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    lineHeight: 18,
  },
  copyRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  copyRowText: { fontSize: 12, color: "#2563eb", fontWeight: "500" },
  configFileCard: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    overflow: "hidden",
  },
  configFileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#f9fafb",
  },
  configFileName: { flex: 1, fontSize: 13, fontWeight: "500", color: "#374151" },
  configFileCopy: { flexDirection: "row", alignItems: "center", gap: 4 },

  successBox: {
    flexDirection: "row",
    gap: 12,
    borderWidth: 1,
    borderColor: "#bbf7d0",
    backgroundColor: "#f0fdf4",
    borderRadius: 12,
    padding: 14,
    alignItems: "flex-start",
  },
  successBoxTitle: { fontSize: 13, fontWeight: "700", color: "#15803d", marginBottom: 3 },
  successBoxText: { fontSize: 12, color: "#16a34a", lineHeight: 18 },

  summaryCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
    gap: 8,
  },
  summaryTitle: { fontSize: 13, fontWeight: "700", color: "#374151", marginBottom: 4 },
  summaryRow: { flexDirection: "row", gap: 8 },
  summaryLabel: { fontSize: 13, color: "#6b7280", width: 80 },
  summaryValue: { fontSize: 13, fontWeight: "600", color: "#111827", flex: 1 },

  doneBox: {
    flexDirection: "row",
    gap: 12,
    borderWidth: 1.5,
    borderColor: "#bbf7d0",
    backgroundColor: "#f0fdf4",
    borderRadius: 12,
    padding: 14,
    alignItems: "flex-start",
  },
  doneBoxTitle: { fontSize: 14, fontWeight: "700", color: "#15803d", marginBottom: 2 },
  doneBoxText: { fontSize: 12, color: "#16a34a", lineHeight: 18 },

  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 16 },
  loadingText: { fontSize: 13, color: "#9333ea" },

  emptyVms: { alignItems: "center", paddingVertical: 24, gap: 8 },
  emptyVmsText: { fontSize: 14, color: "#374151", fontWeight: "500" },
  emptyVmsHint: { fontSize: 12, color: "#9ca3af", textAlign: "center" },

  vmCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  vmCardActive: { borderColor: "#2563eb", backgroundColor: "#eff6ff" },
  vmCardCheck: { width: 22 },
  vmCardEmptyCheck: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: "#d1d5db" },
  vmName: { fontSize: 14, fontWeight: "600", color: "#111827" },
  vmMeta: { fontSize: 12, color: "#6b7280", marginTop: 2 },

  mono: { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 12 },
});
