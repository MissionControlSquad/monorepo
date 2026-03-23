import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
  Animated,
} from "react-native";
import { useState, useEffect, useRef } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../src/context/AuthContext";
import { getStoredCookie } from "../src/api/session";
import {
  USE_CASES,
  ONBOARDING_TEMPLATES,
  getAgentName,
  type OnboardingUseCase,
  DEFAULT_AGENT_EMOJI,
  DEFAULT_AGENT_LEVEL,
} from "@agentcenter/utils";

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
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
}

function buildDraftAgents(templateIds: readonly string[]): DraftAgent[] {
  const ids = templateIds.length > 0 ? templateIds : ["squad-lead"];
  return ids.map((tid) => {
    const tmpl = ONBOARDING_TEMPLATES[tid] ?? {
      id: tid,
      name: tid,
      emoji: DEFAULT_AGENT_EMOJI,
      role: tid,
      personality: "",
      level: DEFAULT_AGENT_LEVEL,
    };
    const agentName = getAgentName(tmpl.id, tmpl.name);
    return {
      templateId: tmpl.id,
      name: agentName,
      username: slugify(agentName),
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
  const { resumeCategory } = useLocalSearchParams<{ resumeCategory?: string }>();

  // Resume from a saved category (user closed app mid-onboarding)
  const initialStep: Step = (() => {
    if (!resumeCategory) return "welcome";
    const uc = USE_CASES.find((u) => u.id === resumeCategory);
    return uc ? "preview" : "welcome";
  })();

  const [step, setStep] = useState<Step>(initialStep);
  const [selectedUseCase, setSelectedUseCase] = useState<OnboardingUseCase | null>(() => {
    if (!resumeCategory) return null;
    return USE_CASES.find((u) => u.id === resumeCategory) ?? null;
  });
  const [draftAgents, setDraftAgents] = useState<DraftAgent[]>(() => {
    if (!resumeCategory) return [];
    const uc = USE_CASES.find((u) => u.id === resumeCategory);
    return uc ? buildDraftAgents(uc.templateIds) : [];
  });
  const [results, setResults] = useState<CreationResult[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [licenseLimit, setLicenseLimit] = useState<number | null>(null);

  const authHeader = (): Record<string, string> => {
    const cookie = getStoredCookie();
    return cookie ? { Cookie: `mc_session=${cookie}` } : {};
  };

  // Pre-fetch license limit on mount
  useEffect(() => {
    if (!serverUrl) return;
    fetch(`${serverUrl}/api/license`, {
      credentials: "include",
      headers: authHeader(),
    })
      .then((r) => r.json())
      .then((data) => {
        const limit = data.maxAgents;
        setLicenseLimit(limit === -1 ? null : (limit ?? null));
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverUrl]);

  const handleSelectUseCase = (uc: OnboardingUseCase) => {
    const teamIds = uc.id === "custom" ? ["squad-lead"] : uc.templateIds;
    let agents = buildDraftAgents(teamIds);

    // Enforce license limit
    if (licenseLimit !== null && agents.length > licenseLimit) {
      agents = agents.slice(0, licenseLimit);
    }

    setSelectedUseCase(uc);
    setDraftAgents(agents);
    setStep("preview");

    // Save progress so resuming the app restores to preview step
    if (serverUrl) {
      fetch(`${serverUrl}/api/onboarding`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ categoryId: uc.id }),
      }).catch(() => {});
    }
  };

  const handleBack = (to: Step) => {
    setStep(to);
    if ((to === "welcome" || to === "use-case") && serverUrl) {
      fetch(`${serverUrl}/api/onboarding`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ categoryId: null }),
      }).catch(() => {});
    }
  };

  const handleCreate = async () => {
    if (!serverUrl) {
      Alert.alert("Error", "No server URL");
      return;
    }
    setStep("creating");

    const resultList: CreationResult[] = [];

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

      const data = (await res.json()) as {
        results?: { name: string; success: boolean; error?: string }[];
        error?: string;
      };

      if (!res.ok) {
        for (const a of draftAgents) {
          resultList.push({ name: a.name, ok: false, error: data.error ?? "Batch create failed" });
        }
      } else {
        for (const r of data.results ?? []) {
          resultList.push({ name: r.name, ok: r.success, error: r.error });
        }
      }
    } catch {
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
    } catch {
      /* best-effort */
    }

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
      } catch {
        /* best-effort */
      }
    }
    router.replace("/(dashboard)");
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#f9fafb" }}>
      {step === "welcome" && (
        <WelcomeStep onNext={() => setStep("use-case")} onSkip={handleSkip} insets={insets} />
      )}
      {step === "use-case" && (
        <UseCaseStep
          onSelect={handleSelectUseCase}
          onBack={() => handleBack("welcome")}
          insets={insets}
          licenseLimit={licenseLimit}
        />
      )}
      {step === "preview" && (
        <PreviewStep
          agents={draftAgents}
          onAgentChange={(idx, updated) =>
            setDraftAgents((prev) => prev.map((a, i) => (i === idx ? updated : a)))
          }
          onAgentRemove={(idx) => setDraftAgents((prev) => prev.filter((_, i) => i !== idx))}
          onAgentAdd={() =>
            setDraftAgents((prev) => [
              ...prev,
              {
                templateId: "blank",
                name: "New Agent",
                username: "new-agent",
                role: "",
                emoji: DEFAULT_AGENT_EMOJI,
                personality: "",
                level: DEFAULT_AGENT_LEVEL,
              },
            ])
          }
          onBack={() => handleBack("use-case")}
          onCreate={handleCreate}
          editingIdx={editingIdx}
          setEditingIdx={setEditingIdx}
          insets={insets}
          licenseLimit={licenseLimit}
        />
      )}
      {step === "creating" && <CreatingStep agents={draftAgents} insets={insets} />}
      {step === "success" && (
        <SuccessStep results={results} onFinish={handleFinish} insets={insets} />
      )}
    </View>
  );
}

// ── Step: Welcome ─────────────────────────────────────────────────────────────

function WelcomeStep({
  onNext,
  onSkip,
  insets,
}: {
  onNext: () => void;
  onSkip: () => void;
  insets: ReturnType<typeof useSafeAreaInsets>;
}) {
  return (
    <ScrollView
      contentContainerStyle={[
        styles.stepContent,
        { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <Text style={styles.welcomeEmoji}>🚀</Text>
      <Text style={styles.welcomeTitle}>Welcome to AgentCenter</Text>
      <Text style={styles.welcomeSub}>Let's set up your AI agent team in a few steps.</Text>

      <View style={styles.featureList}>
        {[
          {
            icon: "people-outline" as const,
            title: "Specialized Agents",
            desc: "Each agent has a specific role, skills, and personality — like real team members.",
          },
          {
            icon: "flash-outline" as const,
            title: "Autonomous Operation",
            desc: "Agents work independently, pick up tasks, and report back with deliverables.",
          },
          {
            icon: "stats-chart-outline" as const,
            title: "Full Visibility",
            desc: "Track every action, deliverable, and status change in real time.",
          },
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

function UseCaseStep({
  onSelect,
  onBack,
  insets,
  licenseLimit,
}: {
  onSelect: (uc: OnboardingUseCase) => void;
  onBack: () => void;
  insets: ReturnType<typeof useSafeAreaInsets>;
  licenseLimit: number | null;
}) {
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
      {licenseLimit !== null && (
        <Text style={styles.licenseNote}>
          Your plan supports up to {licenseLimit} agent{licenseLimit !== 1 ? "s" : ""}
        </Text>
      )}
      <ScrollView
        contentContainerStyle={[styles.useCaseList, { paddingBottom: insets.bottom + 24 }]}
      >
        {USE_CASES.map((uc) => {
          const agentCount =
            uc.id === "custom"
              ? 1
              : licenseLimit !== null
                ? Math.min(uc.templateIds.length, licenseLimit)
                : uc.templateIds.length;
          return (
            <TouchableOpacity
              key={uc.id}
              style={styles.useCaseCard}
              onPress={() => onSelect(uc)}
              activeOpacity={0.75}
            >
              <Text style={styles.useCaseEmoji}>{uc.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.useCaseTitle}>{uc.title}</Text>
                <Text style={styles.useCaseSub}>{uc.subtitle}</Text>
                {agentCount > 0 && (
                  <Text style={styles.useCaseAgentCount}>{agentCount} agent{agentCount !== 1 ? "s" : ""}</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ── Step: Preview ─────────────────────────────────────────────────────────────

function PreviewStep({
  agents,
  onAgentChange,
  onAgentRemove,
  onAgentAdd,
  onBack,
  onCreate,
  editingIdx,
  setEditingIdx,
  insets,
  licenseLimit,
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
  licenseLimit: number | null;
}) {
  const editing = editingIdx !== null ? agents[editingIdx] : null;
  const atLimit = licenseLimit !== null && agents.length >= licenseLimit;

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.stepHeader, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.stepTitle}>Review Your Team</Text>
        <TouchableOpacity onPress={onAgentAdd} style={styles.addBtn} disabled={atLimit}>
          <Ionicons name="add" size={22} color={atLimit ? "#d1d5db" : "#2563eb"} />
        </TouchableOpacity>
      </View>
      <Text style={styles.stepSubtitle}>Tap an agent to edit name, role, or personality.</Text>

      {editingIdx !== null && editing ? (
        <ScrollView
          contentContainerStyle={[styles.editForm, { paddingBottom: insets.bottom + 24 }]}
        >
          <View style={styles.editCard}>
            <Text style={styles.editCardTitle}>
              {editing.emoji} {editing.name}
            </Text>
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
                onChangeText={(t) =>
                  onAgentChange(editingIdx, {
                    ...editing,
                    username: t.toLowerCase().replace(/[^a-z0-9_-]/g, ""),
                  })
                }
                placeholder="e.g. aria-dev"
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.editField}>
              <Text style={styles.editLabel}>Role</Text>
              <TextInput
                style={styles.editInput}
                value={editing.role}
                onChangeText={(t) => onAgentChange(editingIdx, { ...editing, role: t })}
                placeholder="e.g. Frontend Developer"
                placeholderTextColor="#9ca3af"
              />
            </View>

            <View style={styles.editField}>
              <Text style={styles.editLabel}>Personality</Text>
              <TextInput
                style={[styles.editInput, styles.editTextarea]}
                value={editing.personality}
                onChangeText={(t) => onAgentChange(editingIdx, { ...editing, personality: t })}
                placeholder="Describe how this agent thinks and works…"
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={4}
              />
            </View>

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => setEditingIdx(null)}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryBtnText}>Done</Text>
            </TouchableOpacity>

            {agents.length > 1 && (
              <TouchableOpacity
                style={styles.dangerBtn}
                onPress={() => {
                  onAgentRemove(editingIdx);
                  setEditingIdx(null);
                }}
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
              <TouchableOpacity
                key={idx}
                style={styles.agentCard}
                onPress={() => setEditingIdx(idx)}
                activeOpacity={0.75}
              >
                <Text style={styles.agentEmoji}>{agent.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.agentName}>{agent.name}</Text>
                  <Text style={styles.agentRole}>{agent.role}</Text>
                  {agent.username && (
                    <Text style={styles.agentUsername}>@{agent.username}</Text>
                  )}
                </View>
                <Ionicons name="create-outline" size={18} color="#9ca3af" />
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={[styles.previewFooter, { paddingBottom: insets.bottom + 16 }]}>
            <TouchableOpacity style={styles.primaryBtn} onPress={onCreate} activeOpacity={0.8}>
              <Text style={styles.primaryBtnText}>
                Create {agents.length} Agent{agents.length !== 1 ? "s" : ""}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

// ── Step: Creating ────────────────────────────────────────────────────────────

function CreatingStep({
  agents,
  insets,
}: {
  agents: DraftAgent[];
  insets: ReturnType<typeof useSafeAreaInsets>;
}) {
  const [count, setCount] = useState(0);
  const animValue = useRef(new Animated.Value(0)).current;

  // Animate an incrementing counter up to agents.length
  useEffect(() => {
    const total = agents.length;
    const duration = Math.max(1500, total * 400);
    Animated.timing(animValue, {
      toValue: total,
      duration,
      useNativeDriver: false,
    }).start();

    const listener = animValue.addListener(({ value }) => {
      setCount(Math.floor(value));
    });
    return () => animValue.removeListener(listener);
  }, [agents.length, animValue]);

  return (
    <View
      style={[
        styles.stepContent,
        { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <ActivityIndicator size="large" color="#2563eb" style={{ marginBottom: 24 }} />
      <Text style={styles.creatingTitle}>Creating Your Team…</Text>
      <Text style={styles.creatingCounter}>
        {count} / {agents.length} agent{agents.length !== 1 ? "s" : ""}
      </Text>
      <Text style={styles.creatingSub}>This may take a moment.</Text>
      <View style={styles.agentPillList}>
        {agents.map((a, i) => (
          <View key={i} style={[styles.agentPill, i < count ? styles.agentPillDone : null]}>
            <Text style={styles.agentPillEmoji}>{a.emoji}</Text>
            <Text style={[styles.agentPillName, i < count ? styles.agentPillNameDone : null]}>
              {a.name}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Step: Success ─────────────────────────────────────────────────────────────

function SuccessStep({
  results,
  onFinish,
  insets,
}: {
  results: CreationResult[];
  onFinish: () => void;
  insets: ReturnType<typeof useSafeAreaInsets>;
}) {
  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  return (
    <ScrollView
      contentContainerStyle={[
        styles.stepContent,
        { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 },
      ]}
    >
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
        <View
          key={i}
          style={[
            styles.resultRow,
            {
              borderColor: r.ok ? "#bbf7d0" : "#fecaca",
              backgroundColor: r.ok ? "#f0fdf4" : "#fef2f2",
            },
          ]}
        >
          <Ionicons
            name={r.ok ? "checkmark-circle" : "close-circle"}
            size={20}
            color={r.ok ? "#16a34a" : "#dc2626"}
          />
          <Text style={[styles.resultName, { color: r.ok ? "#15803d" : "#b91c1c" }]}>
            {r.name}
          </Text>
          {r.error && <Text style={styles.resultError}>{r.error}</Text>}
        </View>
      ))}

      <TouchableOpacity
        style={[styles.primaryBtn, { marginTop: 16 }]}
        onPress={onFinish}
        activeOpacity={0.8}
      >
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
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  featureTitle: { fontSize: 15, fontWeight: "700", color: "#111827", marginBottom: 2 },
  featureDesc: { fontSize: 13, color: "#6b7280", lineHeight: 19 },

  // Shared buttons
  primaryBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  skipBtn: { alignItems: "center", paddingVertical: 10 },
  skipBtnText: { fontSize: 14, color: "#9ca3af" },
  dangerBtn: { alignItems: "center", paddingVertical: 12 },
  dangerBtnText: { fontSize: 14, color: "#dc2626", fontWeight: "500" },

  // Step header
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  backBtn: { width: 44, height: 44, justifyContent: "center" },
  addBtn: { width: 44, height: 44, justifyContent: "center", alignItems: "flex-end" },
  stepTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
  },
  stepSubtitle: {
    fontSize: 13,
    color: "#9ca3af",
    textAlign: "center",
    marginBottom: 4,
    paddingHorizontal: 24,
  },
  licenseNote: {
    fontSize: 12,
    color: "#2563eb",
    textAlign: "center",
    marginBottom: 8,
    paddingHorizontal: 24,
  },

  // Use case
  useCaseList: { padding: 16, gap: 12 },
  useCaseCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  useCaseEmoji: { fontSize: 32 },
  useCaseTitle: { fontSize: 15, fontWeight: "700", color: "#111827" },
  useCaseSub: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  useCaseAgentCount: { fontSize: 11, color: "#2563eb", fontWeight: "600", marginTop: 4 },

  // Preview
  previewList: { padding: 16, gap: 10 },
  agentCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  agentEmoji: { fontSize: 28 },
  agentName: { fontSize: 15, fontWeight: "700", color: "#111827" },
  agentRole: { fontSize: 12, color: "#6b7280" },
  agentUsername: { fontSize: 11, color: "#2563eb", marginTop: 2 },
  previewFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#f9fafb",
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },

  // Edit form
  editForm: { padding: 16, gap: 12 },
  editCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 16,
    gap: 16,
  },
  editCardTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  editCardRole: { fontSize: 13, color: "#6b7280", marginTop: -10 },
  editField: { gap: 6 },
  editLabel: { fontSize: 13, fontWeight: "600", color: "#374151" },
  editInput: {
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: "#111827",
  },
  editTextarea: { height: 96, textAlignVertical: "top" },

  // Creating
  creatingTitle: { fontSize: 22, fontWeight: "800", color: "#111827", textAlign: "center" },
  creatingCounter: { fontSize: 32, fontWeight: "800", color: "#2563eb", textAlign: "center" },
  creatingSub: { fontSize: 14, color: "#6b7280", textAlign: "center" },
  agentPillList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
    marginTop: 8,
  },
  agentPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#eff6ff",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  agentPillDone: { backgroundColor: "#dcfce7" },
  agentPillEmoji: { fontSize: 16 },
  agentPillName: { fontSize: 13, color: "#1d4ed8", fontWeight: "500" },
  agentPillNameDone: { color: "#15803d" },

  // Success
  successEmoji: { fontSize: 56, textAlign: "center" },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  resultName: { flex: 1, fontSize: 14, fontWeight: "600" },
  resultError: { fontSize: 11, color: "#6b7280" },
});
