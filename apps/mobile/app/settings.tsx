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
} from "react-native";
import { useEffect, useState } from "react";
import { useNavigation } from "expo-router";
import { useQuery, useMutation } from "urql";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { CHANGE_PASSWORD, SET_SYSTEM_SHUTDOWN } from "@agentcenter/graphql-client";
import { gql } from "urql";

const SYSTEM_SETTINGS_QUERY = gql`
  query SystemSettings {
    systemSettings {
      shutdownActive
    }
  }
`;
import { useAuth } from "../src/context/AuthContext";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LicenseData {
  status: string;
  plan: string | null;
  org: string | null;
  expiresAt: string | null;
  features: string[];
  maxAgents: number;
  maxProjects: number;
  maxSeats: number;
}

function limitLabel(n: number): string {
  return n === -1 ? "Unlimited" : String(n);
}

function formatExpiry(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { serverUrl, onLogout } = useAuth();

  useEffect(() => {
    navigation.setOptions({ title: "Settings" });
  }, [navigation]);

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
        <ChangePasswordSection onPasswordChanged={onLogout} />
        <LicenseSection serverUrl={serverUrl} />
        <SystemShutdownSection />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Change Password ───────────────────────────────────────────────────────────

function ChangePasswordSection({ onPasswordChanged }: { onPasswordChanged: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [{ fetching }, changePassword] = useMutation(CHANGE_PASSWORD);

  const handleSubmit = async () => {
    if (!current) { Alert.alert("Validation", "Current password is required"); return; }
    if (next.length < 8) { Alert.alert("Validation", "New password must be at least 8 characters"); return; }
    if (next !== confirm) { Alert.alert("Validation", "Passwords do not match"); return; }

    const res = await changePassword({ currentPassword: current, newPassword: next });
    if (res.error) {
      const msg = res.error.graphQLErrors[0]?.message ?? res.error.message ?? "Failed to change password";
      Alert.alert("Error", msg);
      return;
    }

    Alert.alert(
      "Password Changed",
      "Your password has been changed. All existing sessions will be revoked. You will be signed out.",
      [{ text: "OK", onPress: onPasswordChanged }],
    );
    setCurrent(""); setNext(""); setConfirm("");
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardIconWrap}>
          <Ionicons name="lock-closed-outline" size={20} color="#6b7280" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Change Password</Text>
          <Text style={styles.cardSubtitle}>All existing sessions will be revoked.</Text>
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Current Password</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.inputFlex}
            value={current}
            onChangeText={setCurrent}
            secureTextEntry={!showCurrent}
            placeholder="Current password"
            placeholderTextColor="#9ca3af"
            autoCorrect={false}
            autoCapitalize="none"
          />
          <TouchableOpacity onPress={() => setShowCurrent(!showCurrent)} style={styles.eyeBtn}>
            <Ionicons name={showCurrent ? "eye-off-outline" : "eye-outline"} size={18} color="#9ca3af" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>New Password</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.inputFlex}
            value={next}
            onChangeText={setNext}
            secureTextEntry={!showNext}
            placeholder="Min. 8 characters"
            placeholderTextColor="#9ca3af"
            autoCorrect={false}
            autoCapitalize="none"
          />
          <TouchableOpacity onPress={() => setShowNext(!showNext)} style={styles.eyeBtn}>
            <Ionicons name={showNext ? "eye-off-outline" : "eye-outline"} size={18} color="#9ca3af" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Confirm New Password</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.inputFlex}
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry={!showConfirm}
            placeholder="Repeat new password"
            placeholderTextColor="#9ca3af"
            autoCorrect={false}
            autoCapitalize="none"
          />
          <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} style={styles.eyeBtn}>
            <Ionicons name={showConfirm ? "eye-off-outline" : "eye-outline"} size={18} color="#9ca3af" />
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, fetching && styles.primaryBtnDisabled]}
        onPress={handleSubmit}
        disabled={fetching}
        activeOpacity={0.8}
      >
        {fetching ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.primaryBtnText}>Change Password</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ── License ───────────────────────────────────────────────────────────────────

function LicenseSection({ serverUrl }: { serverUrl: string | null }) {
  const [license, setLicense] = useState<LicenseData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [licenseKey, setLicenseKey] = useState("");
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);

  const fetchLicense = () => {
    if (!serverUrl) return;
    setLoading(true);
    fetch(`${serverUrl}/api/license`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setLicense(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchLicense(); }, [serverUrl]);

  const handleActivate = async () => {
    if (!licenseKey.trim() || !serverUrl) return;
    setActivating(true);
    setActivateError(null);
    try {
      const res = await fetch(`${serverUrl}/api/license`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: licenseKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setActivateError(data.message ?? "Activation failed");
        return;
      }
      setLicenseKey("");
      Alert.alert("Success", "License activated successfully");
      fetchLicense();
    } catch (err) {
      setActivateError((err as Error).message ?? "Something went wrong");
    } finally {
      setActivating(false);
    }
  };

  const statusColor: Record<string, string> = {
    active: "#16a34a",
    grace: "#d97706",
    expired: "#dc2626",
    none: "#6b7280",
  };

  const status = license?.status ?? "none";
  const color = statusColor[status] ?? "#6b7280";

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardIconWrap}>
          <Ionicons name="key-outline" size={20} color="#6b7280" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>License</Text>
          <Text style={styles.cardSubtitle}>Your current license details</Text>
        </View>
        {!loading && license && (
          <View style={[styles.statusBadge, { backgroundColor: color + "22" }]}>
            <Text style={[styles.statusBadgeText, { color }]}>{status}</Text>
          </View>
        )}
      </View>

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color="#2563eb" />
          <Text style={styles.loadingText}>Loading license…</Text>
        </View>
      )}

      {error && !loading && (
        <Text style={styles.errorText}>Failed to load license: {error}</Text>
      )}

      {license && !loading && (
        <>
          <View style={styles.licenseGrid}>
            <LicenseGridItem label="Organization" value={license.org ?? "—"} />
            <LicenseGridItem label="Plan" value={license.plan ?? "—"} />
            <LicenseGridItem label="Expires" value={formatExpiry(license.expiresAt)} />
            <LicenseGridItem
              label="Limits"
              value={`${limitLabel(license.maxAgents)} agents / ${limitLabel(license.maxProjects)} projects / ${limitLabel(license.maxSeats)} seats`}
            />
          </View>

          {license.features.length > 0 && (
            <View style={styles.featuresSection}>
              <Text style={styles.sectionLabel}>Licensed features</Text>
              <View style={styles.featureTags}>
                {license.features.map((f) => (
                  <View key={f} style={styles.featureTag}>
                    <Text style={styles.featureTagText}>{f}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </>
      )}

      {/* Activate / update license */}
      <View style={{ height: 1, backgroundColor: "#f3f4f6" }} />
      <View style={styles.field}>
        <Text style={styles.label}>{license?.status === "active" ? "Update License Key" : "Activate License"}</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.inputFlex}
            value={licenseKey}
            onChangeText={setLicenseKey}
            placeholder="Paste your license key…"
            placeholderTextColor="#9ca3af"
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>
        {activateError ? <Text style={styles.errorText}>{activateError}</Text> : null}
      </View>
      <TouchableOpacity
        style={[styles.primaryBtn, (!licenseKey.trim() || activating) && styles.primaryBtnDisabled]}
        onPress={handleActivate}
        disabled={!licenseKey.trim() || activating}
        activeOpacity={0.8}
      >
        {activating ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.primaryBtnText}>
            {license?.status === "active" ? "Update License" : "Activate License"}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

function LicenseGridItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.licenseGridItem}>
      <Text style={styles.licenseLabel}>{label}</Text>
      <Text style={styles.licenseValue}>{value}</Text>
    </View>
  );
}

// ── System Shutdown ───────────────────────────────────────────────────────────

function SystemShutdownSection() {
  const [result, reexecute] = useQuery<{ systemSettings: { shutdownActive: boolean } | null }>({
    query: SYSTEM_SETTINGS_QUERY,
    requestPolicy: "cache-and-network",
  });

  const [{ fetching }, setShutdown] = useMutation(SET_SYSTEM_SHUTDOWN);

  const active = result.data?.systemSettings?.shutdownActive ?? false;

  const handleToggle = () => {
    const nextActive = !active;
    const action = nextActive ? "Activate" : "Deactivate";
    const message = nextActive
      ? "This will block all new task creation and prevent agents from picking up new work."
      : "This will re-enable task creation and agent work.";

    Alert.alert(`${action} Shutdown`, message, [
      { text: "Cancel", style: "cancel" },
      {
        text: action,
        style: nextActive ? "destructive" : "default",
        onPress: async () => {
          const res = await setShutdown({ active: nextActive });
          if (res.error) {
            Alert.alert("Error", "Failed to update system shutdown");
          } else {
            reexecute({ requestPolicy: "network-only" });
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.cardIconWrap, active && { backgroundColor: "#fee2e2" }]}>
          <Ionicons
            name="power-outline"
            size={20}
            color={active ? "#dc2626" : "#6b7280"}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>System Shutdown</Text>
          {active && (
            <View style={[styles.statusBadge, { backgroundColor: "#fee2e2", alignSelf: "flex-start", marginTop: 4 }]}>
              <Text style={[styles.statusBadgeText, { color: "#dc2626" }]}>Active</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.shutdownEffects}>
        {[
          "Blocks all new task creation (dashboard & API)",
          "Prevents agents from picking up new work",
          "Stops recurring tasks from generating",
          "Does not affect tasks already in progress",
        ].map((line) => (
          <View key={line} style={styles.bulletRow}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.bulletText}>{line}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={[
          styles.primaryBtn,
          active ? styles.shutdownBtnDeactivate : styles.shutdownBtnActivate,
          fetching && styles.primaryBtnDisabled,
        ]}
        onPress={handleToggle}
        disabled={fetching || result.fetching}
        activeOpacity={0.8}
      >
        {fetching ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.primaryBtnText}>
            {active ? "Deactivate Shutdown" : "Activate Shutdown"}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 14,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  cardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  cardSubtitle: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },

  // Form
  field: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 14,
  },
  inputFlex: {
    flex: 1,
    fontSize: 15,
    color: "#111827",
    paddingVertical: 11,
  },
  eyeBtn: {
    padding: 4,
  },

  primaryBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  primaryBtnDisabled: {
    opacity: 0.5,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },

  // License
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "center",
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "lowercase",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: "#6b7280",
  },
  errorText: {
    fontSize: 13,
    color: "#dc2626",
  },
  licenseGrid: {
    gap: 12,
  },
  licenseGridItem: {
    flexDirection: "row",
    gap: 12,
  },
  licenseLabel: {
    fontSize: 13,
    color: "#6b7280",
    width: 100,
    flexShrink: 0,
  },
  licenseValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
  },
  featuresSection: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "lowercase",
    letterSpacing: 0.3,
  },
  featureTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  featureTag: {
    backgroundColor: "#f3f4f6",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  featureTagText: {
    fontSize: 12,
    color: "#374151",
  },

  // Shutdown
  shutdownEffects: {
    gap: 6,
  },
  bulletRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  bullet: {
    fontSize: 14,
    color: "#6b7280",
    lineHeight: 20,
  },
  bulletText: {
    fontSize: 13,
    color: "#6b7280",
    flex: 1,
    lineHeight: 20,
  },
  shutdownBtnActivate: {
    backgroundColor: "#dc2626",
  },
  shutdownBtnDeactivate: {
    backgroundColor: "#16a34a",
  },
});
