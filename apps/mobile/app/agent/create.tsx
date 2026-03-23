import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Clipboard,
} from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/context/AuthContext";
import { getStoredCookie } from "../../src/api/session";

const LEVELS = ["junior", "mid", "senior", "lead"] as const;
type Level = (typeof LEVELS)[number];

interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  emoji: string;
  role: string;
  personality: string;
  level: string;
  category: string;
}

const AGENT_TEMPLATES: AgentTemplate[] = [
  { id: "squad-lead", name: "Squad Lead", description: "Orchestrator — triages inbox, assigns work, reviews deliverables", emoji: "📋", role: "Squad Lead", personality: "The orchestrator. Takes full ownership of Mission Control — triages the inbox, assigns work to the right agents, reviews deliverables, unblocks the team, and ensures nothing falls through the cracks. Thinks strategically about priorities. Proactive: identifies what needs doing and makes it happen.", level: "lead", category: "management" },
  { id: "researcher", name: "Research & Analysis", description: "Deep research, competitive analysis, SEO audits, and data gathering", emoji: "🔍", role: "Research Specialist", personality: "Thorough and analytical. Digs deep into topics, cross-references sources, and delivers well-structured findings.", level: "mid", category: "research" },
  { id: "content-writer", name: "Content & Copywriting", description: "Blog posts, landing pages, documentation, and marketing copy", emoji: "✍️", role: "Content Writer", personality: "Creative and articulate. Adapts tone to audience, writes clean prose, and structures content for readability.", level: "mid", category: "content" },
  { id: "frontend-dev", name: "Frontend Development", description: "React/Next.js components, UI implementation, and frontend features", emoji: "⚛️", role: "Frontend Developer", personality: "Detail-oriented and pragmatic. Writes clean, accessible code. Follows existing patterns and tests thoroughly.", level: "mid", category: "engineering" },
  { id: "backend-dev", name: "Backend Development", description: "APIs, databases, authentication, server architecture, and performance", emoji: "🔧", role: "Backend Developer", personality: "Systematic and security-conscious. Designs clean APIs, writes safe database queries, and builds for reliability.", level: "mid", category: "engineering" },
  { id: "ux-designer", name: "UI/UX Design", description: "Wireframes, design systems, user flows, and interface design", emoji: "🎨", role: "UX Designer", personality: "User-centric and visually thoughtful. Balances aesthetics with usability, thinks in systems.", level: "mid", category: "design" },
  { id: "qa-testing", name: "QA & Testing", description: "Test strategy, automation, bug reporting, performance and accessibility testing", emoji: "🧪", role: "QA Engineer", personality: "Methodical and thorough. Designs tests that catch bugs before users do. Writes clear bug reports.", level: "mid", category: "testing" },
  { id: "social-media", name: "Social Media", description: "Social posts, engagement strategy, content calendars, and community", emoji: "📱", role: "Social Media Manager", personality: "Trend-aware and engaging. Understands platform nuances, crafts scroll-stopping content.", level: "mid", category: "marketing" },
  { id: "seo-strategist", name: "SEO Strategy", description: "Technical SEO, keyword research, on-page optimization, and rank tracking", emoji: "📈", role: "SEO Strategist", personality: "Data-driven and strategic. Understands search algorithms and creates actionable optimization plans.", level: "mid", category: "marketing" },
  { id: "email-marketer", name: "Email Marketing", description: "Email sequences, deliverability, segmentation, and automation flows", emoji: "📧", role: "Email Marketer", personality: "Conversion-focused and analytical. Crafts emails that get opened and clicked. Tests everything.", level: "mid", category: "marketing" },
];

const EMOJI_PRESETS = [
  "🤖","🦾","🧠","⚡","🎯","🔧","🚀","🌟","🦊","🐉",
  "🐺","🦁","🐻","🦅","🦋","🌊","🔥","💎","🛡️","⚔️",
];

interface CreatedAgent {
  id: string;
  name: string;
  apiKey: string;
  cronCommand?: string;
}

export default function CreateAgentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { serverUrl } = useAuth();

  const [step, setStep] = useState<"template" | "form">("template");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("");
  const [emoji, setEmoji] = useState("🤖");
  const [level, setLevel] = useState<Level>("mid");
  const [personality, setPersonality] = useState("");
  const [workspacePath, setWorkspacePath] = useState("");
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<CreatedAgent | null>(null);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);

  function applyTemplate(t: AgentTemplate) {
    setRole(t.role);
    setEmoji(t.emoji);
    setPersonality(t.personality);
    const lvl = LEVELS.includes(t.level as Level) ? (t.level as Level) : "mid";
    setLevel(lvl);
    setStep("form");
  }

  const handleCreate = async () => {
    if (!name.trim()) { Alert.alert("Required", "Agent name is required"); return; }
    if (!role.trim()) { Alert.alert("Required", "Agent role is required"); return; }
    if (!serverUrl) { Alert.alert("Error", "No server URL configured"); return; }

    setLoading(true);
    try {
      const cookie = getStoredCookie();
      const res = await fetch(`${serverUrl}/api/agents/create`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: `mc_session=${cookie}` } : {}),
        },
        body: JSON.stringify({
          name: name.trim(),
          role: role.trim(),
          identityEmoji: emoji,
          level,
          personality: personality.trim() || undefined,
          username: username.trim() || undefined,
          workspacePath: workspacePath.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `Failed to create agent (${res.status})`);
      }
      setCreated({ id: data.agent.id, name: data.agent.name, apiKey: data.apiKey, cronCommand: data.cronCommand });
    } catch (err) {
      Alert.alert("Error", (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (created) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: "#f9fafb" }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={styles.successBanner}>
          <Text style={styles.successEmoji}>🎉</Text>
          <Text style={styles.successTitle}>Agent Created!</Text>
          <Text style={styles.successSub}>{created.name} is ready to be set up.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>API Key</Text>
          <Text style={styles.apiKeyNote}>
            Copy this key now — it won't be shown again. The agent needs it to authenticate.
          </Text>
          <View style={styles.apiKeyRow}>
            <Text
              style={styles.apiKeyText}
              numberOfLines={apiKeyVisible ? undefined : 1}
              ellipsizeMode="middle"
            >
              {apiKeyVisible ? created.apiKey : "••••••••••••••••••••••••••••••••"}
            </Text>
            <TouchableOpacity onPress={() => setApiKeyVisible(!apiKeyVisible)} style={styles.iconBtn}>
              <Ionicons name={apiKeyVisible ? "eye-off-outline" : "eye-outline"} size={18} color="#6b7280" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                Clipboard.setString(created.apiKey);
                Alert.alert("Copied", "API key copied to clipboard");
              }}
              style={styles.iconBtn}
            >
              <Ionicons name="copy-outline" size={18} color="#2563eb" />
            </TouchableOpacity>
          </View>
        </View>

        {created.cronCommand && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Cron Command</Text>
            <Text style={styles.codeText}>{created.cronCommand}</Text>
            <TouchableOpacity
              style={styles.copyRow}
              onPress={() => {
                Clipboard.setString(created.cronCommand!);
                Alert.alert("Copied", "Cron command copied");
              }}
            >
              <Ionicons name="copy-outline" size={14} color="#2563eb" />
              <Text style={styles.copyText}>Copy command</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => {
            router.replace(`/agent/${created.id}`);
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryBtnText}>View Agent Profile</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Text style={styles.secondaryBtnText}>Back to Agents</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (step === "template") {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: "#f9fafb" }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        contentInsetAdjustmentBehavior="automatic"
      >
        <Text style={styles.sectionTitle}>Choose a Template</Text>
        <Text style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
          Start with a pre-configured role, or begin from scratch.
        </Text>
        {AGENT_TEMPLATES.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={styles.templateCard}
            onPress={() => applyTemplate(t)}
            activeOpacity={0.75}
          >
            <Text style={styles.templateEmoji}>{t.emoji}</Text>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.templateName}>{t.name}</Text>
              <Text style={styles.templateDesc} numberOfLines={2}>{t.description}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[styles.secondaryBtn, { marginTop: 8 }]}
          onPress={() => setStep("form")}
          activeOpacity={0.8}
        >
          <Text style={styles.secondaryBtnText}>Start from Scratch</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#f9fafb" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        {/* Identity */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Identity</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Name <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Aria"
              placeholderTextColor="#9ca3af"
              autoFocus
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Role <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={styles.input}
              value={role}
              onChangeText={setRole}
              placeholder="e.g. Backend Engineer"
              placeholderTextColor="#9ca3af"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Username <Text style={styles.optional}>(optional)</Text></Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={(t) => setUsername(t.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
              placeholder="e.g. aria-dev"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Emoji</Text>
            <View style={styles.emojiGrid}>
              {EMOJI_PRESETS.map((e) => (
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

        {/* Level */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Level</Text>
          <View style={styles.chipRow}>
            {LEVELS.map((l) => (
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

        {/* Personality */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Personality & Instructions</Text>
          <Text style={styles.hint}>
            Describe how this agent should behave, its expertise, and working style.
          </Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={personality}
            onChangeText={setPersonality}
            placeholder="e.g. You are a meticulous backend engineer who writes clean, well-tested code…"
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={6}
            textAlignVertical="top"
          />
        </View>

        {/* Workspace */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Workspace</Text>
          <View style={styles.field}>
            <Text style={styles.label}>Workspace Path <Text style={styles.optional}>(optional)</Text></Text>
            <Text style={styles.hint}>Absolute path to the directory this agent will work in.</Text>
            <TextInput
              style={styles.input}
              value={workspacePath}
              onChangeText={setWorkspacePath}
              placeholder="e.g. /home/aria/workspace"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
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

        <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 12,
  },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: "#111827" },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: "600", color: "#374151" },
  required: { color: "#dc2626" },
  optional: { color: "#9ca3af", fontWeight: "400" },
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
  textArea: { minHeight: 120, paddingTop: 11 },
  hint: { fontSize: 12, color: "#9ca3af" },

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
  chipText: { fontSize: 14, color: "#6b7280", fontWeight: "500" },
  chipTextActive: { color: "#2563eb", fontWeight: "600" },

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
  cancelBtn: { alignItems: "center", paddingVertical: 10 },
  cancelBtnText: { fontSize: 15, color: "#6b7280" },

  // Template selection
  templateCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 12,
  },
  templateEmoji: { fontSize: 24, width: 32, textAlign: "center" },
  templateName: { fontSize: 14, fontWeight: "600", color: "#111827" },
  templateDesc: { fontSize: 12, color: "#6b7280", lineHeight: 16 },

  // Success screen
  successBanner: { alignItems: "center", paddingVertical: 24, gap: 8 },
  successEmoji: { fontSize: 48 },
  successTitle: { fontSize: 22, fontWeight: "800", color: "#111827" },
  successSub: { fontSize: 14, color: "#6b7280", textAlign: "center" },

  cardLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  apiKeyNote: { fontSize: 12, color: "#6b7280" },
  apiKeyRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  apiKeyText: {
    flex: 1,
    fontSize: 13,
    color: "#111827",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  iconBtn: { padding: 4 },
  codeText: {
    fontSize: 12,
    color: "#374151",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    padding: 12,
    lineHeight: 20,
  },
  copyRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  copyText: { fontSize: 13, color: "#2563eb", fontWeight: "500" },
});
