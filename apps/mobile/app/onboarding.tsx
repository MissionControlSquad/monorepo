import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
} from "react-native";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../src/context/AuthContext";
import { getStoredCookie } from "../src/api/session";

// ── Use Cases ─────────────────────────────────────────────────────────────────

const USE_CASES = [
  {
    id: "solo-founder",
    emoji: "🚀",
    title: "Solo Founder / Startup",
    subtitle: "A lean team covering research, content, code, and outreach",
    templateIds: ["squad-lead", "researcher", "content-writer", "frontend-dev", "sdr-sales"],
  },
  {
    id: "marketing-agency",
    emoji: "📣",
    title: "Marketing Agency",
    subtitle: "Content, SEO, social media, and ad copy specialists",
    templateIds: ["squad-lead", "content-writer", "seo-strategist", "social-media", "ad-copywriter"],
  },
  {
    id: "dev-team",
    emoji: "💻",
    title: "Development Team",
    subtitle: "Full-stack engineering with DevOps and QA",
    templateIds: ["squad-lead", "frontend-dev", "backend-dev", "devops", "qa-testing"],
  },
  {
    id: "sales-growth",
    emoji: "📈",
    title: "Sales & Growth",
    subtitle: "Outbound prospecting, deal strategy, and pipeline analytics",
    templateIds: ["squad-lead", "sdr-sales", "outbound-strategist", "deal-strategist", "pipeline-analyst"],
  },
  {
    id: "research-academic",
    emoji: "🔬",
    title: "Research & Academic",
    subtitle: "Deep research, data analysis, and technical writing",
    templateIds: ["squad-lead", "researcher", "data-analyst", "content-writer", "technical-writer"],
  },
  {
    id: "custom",
    emoji: "🛠️",
    title: "Custom",
    subtitle: "Start with a lead agent and build your own team",
    templateIds: [],
  },
] as const;

// ── Agent Templates (subset of web's agent-wizard-templates) ──────────────────

interface AgentTemplate {
  id: string;
  name: string;
  emoji: string;
  role: string;
  personality: string;
  level: string;
}

const TEMPLATES: Record<string, AgentTemplate> = {
  "squad-lead": { id: "squad-lead", name: "Squad Lead", emoji: "📋", role: "Squad Lead", personality: "The orchestrator. Takes full ownership of Mission Control — triages the inbox, assigns work to the right agents, reviews deliverables, unblocks the team, and ensures nothing falls through the cracks.", level: "lead" },
  "researcher": { id: "researcher", name: "Research & Analysis", emoji: "🔍", role: "Research Specialist", personality: "Thorough and analytical. Digs deep into topics, cross-references sources, and delivers well-structured findings.", level: "specialist" },
  "content-writer": { id: "content-writer", name: "Content & Copywriting", emoji: "✍️", role: "Content Writer", personality: "Creative and articulate. Adapts tone to audience, writes clean prose, and structures content for readability.", level: "specialist" },
  "frontend-dev": { id: "frontend-dev", name: "Frontend Development", emoji: "⚛️", role: "Frontend Developer", personality: "Detail-oriented and pragmatic. Writes clean, accessible code. Follows existing patterns and tests thoroughly.", level: "specialist" },
  "sdr-sales": { id: "sdr-sales", name: "Sales Development", emoji: "📞", role: "SDR", personality: "Persistent and strategic. Crafts personalized outreach, qualifies leads efficiently, and books meetings consistently.", level: "specialist" },
  "seo-strategist": { id: "seo-strategist", name: "SEO Strategy", emoji: "📈", role: "SEO Strategist", personality: "Data-driven and methodical. Identifies ranking opportunities and implements technical and on-page SEO.", level: "specialist" },
  "social-media": { id: "social-media", name: "Social Media Management", emoji: "📱", role: "Social Media Manager", personality: "Trend-aware and engaging. Understands platform nuances, crafts scroll-stopping content.", level: "specialist" },
  "ad-copywriter": { id: "ad-copywriter", name: "Ad Copywriting", emoji: "🎯", role: "Ad Copywriter", personality: "Conversion-focused and creative. Tests hooks and CTAs relentlessly, optimizes for ROAS.", level: "specialist" },
  "backend-dev": { id: "backend-dev", name: "Backend Development", emoji: "🔧", role: "Backend Developer", personality: "Systematic and security-conscious. Designs clean APIs, writes safe database queries, and builds for reliability.", level: "specialist" },
  "devops": { id: "devops", name: "DevOps & Infrastructure", emoji: "⚙️", role: "DevOps Engineer", personality: "Reliability-obsessed. Automates everything, monitors proactively, and treats infrastructure as code.", level: "specialist" },
  "qa-testing": { id: "qa-testing", name: "QA & Testing", emoji: "🧪", role: "QA Engineer", personality: "Methodical and thorough. Designs tests that catch bugs before users do. Writes clear bug reports.", level: "specialist" },
  "outbound-strategist": { id: "outbound-strategist", name: "Outbound Strategy", emoji: "📤", role: "Outbound Strategist", personality: "Creative and data-driven. Designs multi-channel outreach sequences that generate qualified pipeline.", level: "specialist" },
  "deal-strategist": { id: "deal-strategist", name: "Deal Strategy", emoji: "🤝", role: "Deal Strategist", personality: "Strategic and empathetic. Maps stakeholder networks, anticipates objections, and accelerates deal velocity.", level: "specialist" },
  "pipeline-analyst": { id: "pipeline-analyst", name: "Pipeline Analytics", emoji: "📊", role: "Pipeline Analyst", personality: "Numbers-first and insightful. Surfaces pipeline health issues and forecasting risks proactively.", level: "specialist" },
  "data-analyst": { id: "data-analyst", name: "Data Analysis", emoji: "📊", role: "Data Analyst", personality: "Rigorous and story-driven. Turns raw data into clear insights and actionable recommendations.", level: "specialist" },
  "technical-writer": { id: "technical-writer", name: "Technical Writing", emoji: "📝", role: "Technical Writer", personality: "Clear and precise. Makes complex topics accessible and keeps documentation current and accurate.", level: "specialist" },
};

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = "welcome" | "use-case" | "preview" | "creating" | "success";

interface DraftAgent {
  templateId: string;
  name: string;
  username: string;
  role: string;
  emoji: string;
  personality: string;
  level: string;
}

interface CreationResult {
  name: string;
  ok: boolean;
  error?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
}

function buildDraftAgents(templateIds: readonly string[]): DraftAgent[] {
  const ids = templateIds.length > 0 ? templateIds : ["squad-lead"];
  return ids.map((tid) => {
    const tmpl = TEMPLATES[tid] ?? { id: tid, name: tid, emoji: "🤖", role: tid, personality: "", level: "specialist" };
    return {
      templateId: tmpl.id,
      name: tmpl.name,
      username: slugify(tmpl.name),
      role: tmpl.role,
      emoji: tmpl.emoji,
      personality: tmpl.personality,
      level: tmpl.level,
    };
  });
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { serverUrl } = useAuth();

  const [step, setStep] = useState<Step>("welcome");
  const [selectedUseCase, setSelectedUseCase] = useState<typeof USE_CASES[number] | null>(null);
  const [draftAgents, setDraftAgents] = useState<DraftAgent[]>([]);
  const [results, setResults] = useState<CreationResult[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const authHeader = (): Record<string, string> => {
    const cookie = getStoredCookie();
    return cookie ? { Cookie: `mc_session=${cookie}` } : {};
  };

  const handleSelectUseCase = (uc: typeof USE_CASES[number]) => {
    setSelectedUseCase(uc);
    setDraftAgents(buildDraftAgents(uc.templateIds));
    setStep("preview");
  };

  const handleCreate = async () => {
    if (!serverUrl) { Alert.alert("Error", "No server URL"); return; }
    setStep("creating");

    const resultList: CreationResult[] = [];

    // Use batch-create endpoint
    try {
      const payload = draftAgents.map((a) => ({
        name: a.name,
        role: a.role,
        username: a.username || undefined,
        identityEmoji: a.emoji,
        personality: a.personality || undefined,
        level: a.level,
        templateId: a.templateId,
      }));

      const res = await fetch(`${serverUrl}/api/agents/batch-create`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ agents: payload }),
      });

      const data = await res.json() as { results?: { name: string; success: boolean; error?: string }[]; error?: string };

      if (!res.ok) {
        // If batch fails, mark all as failed
        for (const a of draftAgents) {
          resultList.push({ name: a.name, ok: false, error: data.error ?? "Batch create failed" });
        }
      } else {
        for (const r of (data.results ?? [])) {
          resultList.push({ name: r.name, ok: r.success, error: r.error });
        }
      }
    } catch (e) {
      for (const a of draftAgents) {
        resultList.push({ name: a.name, ok: false, error: "Network error" });
      }
    }

    // Mark onboarding complete
    try {
      await fetch(`${serverUrl}/api/onboarding`, {
        method: "POST",
        credentials: "include",
        headers: { ...authHeader() },
      });
    } catch { /* best-effort */ }

    setResults(resultList);
    setStep("success");
  };

  const handleFinish = () => {
    router.replace("/(dashboard)");
  };

  const handleSkip = async () => {
    if (serverUrl) {
      try {
        await fetch(`${serverUrl}/api/onboarding`, {
          method: "POST",
          credentials: "include",
          headers: { ...authHeader() },
        });
      } catch { /* best-effort */ }
    }
    router.replace("/(dashboard)");
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#f9fafb" }}>
      {step === "welcome" && <WelcomeStep onNext={() => setStep("use-case")} onSkip={handleSkip} insets={insets} />}
      {step === "use-case" && <UseCaseStep onSelect={handleSelectUseCase} onBack={() => setStep("welcome")} insets={insets} />}
      {step === "preview" && (
        <PreviewStep
          agents={draftAgents}
          onAgentChange={(idx, updated) => setDraftAgents((prev) => prev.map((a, i) => i === idx ? updated : a))}
          onAgentRemove={(idx) => setDraftAgents((prev) => prev.filter((_, i) => i !== idx))}
          onAgentAdd={() => setDraftAgents((prev) => [...prev, { templateId: "blank", name: "New Agent", username: "new-agent", role: "", emoji: "🤖", personality: "", level: "specialist" }])}
          onBack={() => setStep("use-case")}
          onCreate={handleCreate}
          editingIdx={editingIdx}
          setEditingIdx={setEditingIdx}
          insets={insets}
        />
      )}
      {step === "creating" && <CreatingStep agents={draftAgents} insets={insets} />}
      {step === "success" && <SuccessStep results={results} onFinish={handleFinish} insets={insets} />}
    </View>
  );
}

// ── Step: Welcome ─────────────────────────────────────────────────────────────

function WelcomeStep({ onNext, onSkip, insets }: { onNext: () => void; onSkip: () => void; insets: ReturnType<typeof useSafeAreaInsets> }) {
  return (
    <ScrollView contentContainerStyle={[styles.stepContent, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}>
      <Text style={styles.welcomeEmoji}>🚀</Text>
      <Text style={styles.welcomeTitle}>Welcome to AgentCenter</Text>
      <Text style={styles.welcomeSub}>Let's set up your AI agent team in a few steps.</Text>

      <View style={styles.featureList}>
        {[
          { icon: "people-outline" as const, title: "Specialized Agents", desc: "Each agent has a specific role, skills, and personality — like real team members." },
          { icon: "flash-outline" as const, title: "Autonomous Operation", desc: "Agents work independently, pick up tasks, and report back with deliverables." },
          { icon: "stats-chart-outline" as const, title: "Full Visibility", desc: "Track every action, deliverable, and status change in real time." },
        ].map((f) => (
          <View key={f.title} style={styles.featureRow}>
            <View style={styles.featureIcon}>
              <Ionicons name={f.icon} size={22} color="#2563eb" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.featureTitle}>{f.title}</Text>
              <Text style={styles.featureDesc}>{f.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.primaryBtn} onPress={onNext} activeOpacity={0.8}>
        <Text style={styles.primaryBtnText}>Get Started</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.skipBtn} onPress={onSkip} activeOpacity={0.7}>
        <Text style={styles.skipBtnText}>Skip setup, go to dashboard</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Step: Use Case ────────────────────────────────────────────────────────────

function UseCaseStep({ onSelect, onBack, insets }: { onSelect: (uc: typeof USE_CASES[number]) => void; onBack: () => void; insets: ReturnType<typeof useSafeAreaInsets> }) {
  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.stepHeader, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.stepTitle}>Choose Your Use Case</Text>
        <View style={{ width: 44 }} />
      </View>
      <Text style={styles.stepSubtitle}>Pick the team template that best fits your work.</Text>
      <ScrollView contentContainerStyle={[styles.useCaseList, { paddingBottom: insets.bottom + 24 }]}>
        {USE_CASES.map((uc) => (
          <TouchableOpacity key={uc.id} style={styles.useCaseCard} onPress={() => onSelect(uc)} activeOpacity={0.75}>
            <Text style={styles.useCaseEmoji}>{uc.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.useCaseTitle}>{uc.title}</Text>
              <Text style={styles.useCaseSub}>{uc.subtitle}</Text>
              {uc.templateIds.length > 0 && (
                <Text style={styles.useCaseAgentCount}>{uc.templateIds.length} agents</Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

// ── Step: Preview ─────────────────────────────────────────────────────────────

function PreviewStep({
  agents, onAgentChange, onAgentRemove, onAgentAdd, onBack, onCreate, editingIdx, setEditingIdx, insets,
}: {
  agents: DraftAgent[];
  onAgentChange: (idx: number, updated: DraftAgent) => void;
  onAgentRemove: (idx: number) => void;
  onAgentAdd: () => void;
  onBack: () => void;
  onCreate: () => void;
  editingIdx: number | null;
  setEditingIdx: (idx: number | null) => void;
  insets: ReturnType<typeof useSafeAreaInsets>;
}) {
  const editing = editingIdx !== null ? agents[editingIdx] : null;

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.stepHeader, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.stepTitle}>Review Your Team</Text>
        <TouchableOpacity onPress={onAgentAdd} style={styles.addBtn}>
          <Ionicons name="add" size={22} color="#2563eb" />
        </TouchableOpacity>
      </View>
      <Text style={styles.stepSubtitle}>Tap an agent to edit their name or username.</Text>

      {editingIdx !== null && editing ? (
        <ScrollView contentContainerStyle={[styles.editForm, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.editCard}>
            <Text style={styles.editCardTitle}>{editing.emoji} {editing.name}</Text>
            <Text style={styles.editCardRole}>{editing.role}</Text>

            <View style={styles.editField}>
              <Text style={styles.editLabel}>Name</Text>
              <TextInput
                style={styles.editInput}
                value={editing.name}
                onChangeText={(t) => onAgentChange(editingIdx, { ...editing, name: t })}
                placeholder="Agent name"
                placeholderTextColor="#9ca3af"
              />
            </View>

            <View style={styles.editField}>
              <Text style={styles.editLabel}>Username</Text>
              <TextInput
                style={styles.editInput}
                value={editing.username}
                onChangeText={(t) => onAgentChange(editingIdx, { ...editing, username: t.toLowerCase().replace(/[^a-z0-9_-]/g, "") })}
                placeholder="e.g. aria-dev"
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <TouchableOpacity style={styles.primaryBtn} onPress={() => setEditingIdx(null)} activeOpacity={0.8}>
              <Text style={styles.primaryBtnText}>Done</Text>
            </TouchableOpacity>

            {agents.length > 1 && (
              <TouchableOpacity
                style={styles.dangerBtn}
                onPress={() => { onAgentRemove(editingIdx); setEditingIdx(null); }}
                activeOpacity={0.7}
              >
                <Text style={styles.dangerBtnText}>Remove Agent</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      ) : (
        <>
          <ScrollView contentContainerStyle={[styles.previewList, { paddingBottom: 100 }]}>
            {agents.map((agent, idx) => (
              <TouchableOpacity key={idx} style={styles.agentCard} onPress={() => setEditingIdx(idx)} activeOpacity={0.75}>
                <Text style={styles.agentEmoji}>{agent.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.agentName}>{agent.name}</Text>
                  <Text style={styles.agentRole}>{agent.role}</Text>
                  {agent.username && <Text style={styles.agentUsername}>@{agent.username}</Text>}
                </View>
                <Ionicons name="create-outline" size={18} color="#9ca3af" />
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={[styles.previewFooter, { paddingBottom: insets.bottom + 16 }]}>
            <TouchableOpacity style={styles.primaryBtn} onPress={onCreate} activeOpacity={0.8}>
              <Text style={styles.primaryBtnText}>Create {agents.length} Agent{agents.length !== 1 ? "s" : ""}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

// ── Step: Creating ────────────────────────────────────────────────────────────

function CreatingStep({ agents, insets }: { agents: DraftAgent[]; insets: ReturnType<typeof useSafeAreaInsets> }) {
  return (
    <View style={[styles.stepContent, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}>
      <ActivityIndicator size="large" color="#2563eb" style={{ marginBottom: 24 }} />
      <Text style={styles.creatingTitle}>Creating Your Team…</Text>
      <Text style={styles.creatingSub}>Setting up {agents.length} agent{agents.length !== 1 ? "s" : ""}. This may take a moment.</Text>
      <View style={styles.agentPillList}>
        {agents.map((a, i) => (
          <View key={i} style={styles.agentPill}>
            <Text style={styles.agentPillEmoji}>{a.emoji}</Text>
            <Text style={styles.agentPillName}>{a.name}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Step: Success ─────────────────────────────────────────────────────────────

function SuccessStep({ results, onFinish, insets }: { results: CreationResult[]; onFinish: () => void; insets: ReturnType<typeof useSafeAreaInsets> }) {
  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  return (
    <ScrollView contentContainerStyle={[styles.stepContent, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}>
      <Text style={styles.successEmoji}>🎉</Text>
      <Text style={styles.welcomeTitle}>
        {failed === 0 ? "Team Created!" : `${succeeded} of ${results.length} Created`}
      </Text>
      <Text style={styles.welcomeSub}>
        {failed === 0
          ? "Your agents are ready. Head to the dashboard to assign tasks and set them up."
          : "Some agents couldn't be created. You can add them manually from the Agents tab."}
      </Text>

      {results.map((r, i) => (
        <View key={i} style={[styles.resultRow, { borderColor: r.ok ? "#bbf7d0" : "#fecaca", backgroundColor: r.ok ? "#f0fdf4" : "#fef2f2" }]}>
          <Ionicons name={r.ok ? "checkmark-circle" : "close-circle"} size={20} color={r.ok ? "#16a34a" : "#dc2626"} />
          <Text style={[styles.resultName, { color: r.ok ? "#15803d" : "#b91c1c" }]}>{r.name}</Text>
          {r.error && <Text style={styles.resultError}>{r.error}</Text>}
        </View>
      ))}

      <TouchableOpacity style={[styles.primaryBtn, { marginTop: 16 }]} onPress={onFinish} activeOpacity={0.8}>
        <Text style={styles.primaryBtnText}>Go to Dashboard</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  stepContent: { flexGrow: 1, padding: 24, alignItems: "stretch", gap: 16 },

  // Welcome
  welcomeEmoji: { fontSize: 56, textAlign: "center", marginBottom: 4 },
  welcomeTitle: { fontSize: 26, fontWeight: "800", color: "#111827", textAlign: "center" },
  welcomeSub: { fontSize: 15, color: "#6b7280", textAlign: "center", lineHeight: 22 },
  featureList: { gap: 16, marginVertical: 8 },
  featureRow: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  featureIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#eff6ff", justifyContent: "center", alignItems: "center", flexShrink: 0 },
  featureTitle: { fontSize: 15, fontWeight: "700", color: "#111827", marginBottom: 2 },
  featureDesc: { fontSize: 13, color: "#6b7280", lineHeight: 19 },

  // Shared buttons
  primaryBtn: { backgroundColor: "#2563eb", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  skipBtn: { alignItems: "center", paddingVertical: 10 },
  skipBtnText: { fontSize: 14, color: "#9ca3af" },
  dangerBtn: { alignItems: "center", paddingVertical: 12 },
  dangerBtnText: { fontSize: 14, color: "#dc2626", fontWeight: "500" },

  // Step header
  stepHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 8 },
  backBtn: { width: 44, height: 44, justifyContent: "center" },
  addBtn: { width: 44, height: 44, justifyContent: "center", alignItems: "flex-end" },
  stepTitle: { flex: 1, fontSize: 17, fontWeight: "700", color: "#111827", textAlign: "center" },
  stepSubtitle: { fontSize: 13, color: "#9ca3af", textAlign: "center", marginBottom: 8, paddingHorizontal: 24 },

  // Use case
  useCaseList: { padding: 16, gap: 12 },
  useCaseCard: {
    backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#e5e7eb",
    padding: 16, flexDirection: "row", alignItems: "center", gap: 14,
  },
  useCaseEmoji: { fontSize: 32 },
  useCaseTitle: { fontSize: 15, fontWeight: "700", color: "#111827" },
  useCaseSub: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  useCaseAgentCount: { fontSize: 11, color: "#2563eb", fontWeight: "600", marginTop: 4 },

  // Preview
  previewList: { padding: 16, gap: 10 },
  agentCard: {
    backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#e5e7eb",
    padding: 14, flexDirection: "row", alignItems: "center", gap: 12,
  },
  agentEmoji: { fontSize: 28 },
  agentName: { fontSize: 15, fontWeight: "700", color: "#111827" },
  agentRole: { fontSize: 12, color: "#6b7280" },
  agentUsername: { fontSize: 11, color: "#2563eb", marginTop: 2 },
  previewFooter: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#f9fafb", padding: 16, borderTopWidth: 1, borderTopColor: "#e5e7eb" },

  // Edit form
  editForm: { padding: 16, gap: 12 },
  editCard: { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#e5e7eb", padding: 16, gap: 16 },
  editCardTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  editCardRole: { fontSize: 13, color: "#6b7280", marginTop: -10 },
  editField: { gap: 6 },
  editLabel: { fontSize: 13, fontWeight: "600", color: "#374151" },
  editInput: {
    backgroundColor: "#f9fafb", borderWidth: 1, borderColor: "#e5e7eb",
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: "#111827",
  },

  // Creating
  creatingTitle: { fontSize: 22, fontWeight: "800", color: "#111827", textAlign: "center" },
  creatingSub: { fontSize: 14, color: "#6b7280", textAlign: "center" },
  agentPillList: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 8 },
  agentPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#eff6ff", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  agentPillEmoji: { fontSize: 16 },
  agentPillName: { fontSize: 13, color: "#1d4ed8", fontWeight: "500" },

  // Success
  successEmoji: { fontSize: 56, textAlign: "center" },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 10, borderWidth: 1 },
  resultName: { flex: 1, fontSize: 14, fontWeight: "600" },
  resultError: { fontSize: 11, color: "#6b7280" },
});
