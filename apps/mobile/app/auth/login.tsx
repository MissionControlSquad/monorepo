import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { login } from "../../src/api/auth";
import { useAuth } from "../../src/context/AuthContext";
import { isValidServerUrl, checkServerSetup } from "@agentcenter/utils";

type Mode = "url" | "login" | "setup";

export default function LoginScreen() {
  const [mode, setMode] = useState<Mode>("url");
  const [serverUrl, setServerUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { onLogin } = useAuth();

  const handleForgotPassword = () => {
    router.push({
      pathname: "/auth/reset-password",
      params: serverUrl.trim() ? { serverUrl: serverUrl.trim() } : {},
    });
  };

  const handleConnect = async () => {
    const url = serverUrl.trim();
    if (!url) {
      Alert.alert("Missing field", "Please enter your server URL.");
      return;
    }
    if (!isValidServerUrl(url)) {
      Alert.alert("Invalid URL", "Server URL must start with http:// or https://");
      return;
    }

    setLoading(true);
    try {
      const { setupComplete } = await checkServerSetup(url);
      setMode(setupComplete ? "login" : "setup");
    } catch {
      Alert.alert("Connection failed", "Could not connect to the server. Check the URL and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSetup = async () => {
    if (!username.trim() || !password.trim() || !confirmPassword.trim()) {
      Alert.alert("Missing fields", "Please fill in all fields.");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Password mismatch", "Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const url = serverUrl.trim();
      const res = await fetch(`${url}/api/auth/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Setup failed");
      }
      // After setup, log in automatically
      const { profileId } = await login(url, username.trim(), password);
      onLogin(url, profileId);
      router.replace("/(dashboard)");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Setup failed";
      Alert.alert("Setup failed", msg);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert("Missing fields", "Please enter your username and password.");
      return;
    }

    setLoading(true);
    try {
      const url = serverUrl.trim();
      const { profileId } = await login(url, username.trim(), password);
      onLogin(url, profileId);
      router.replace("/(dashboard)");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed";
      Alert.alert("Sign in failed", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.logo}>AgentCenter</Text>
        <Text style={styles.subtitle}>Mission Control</Text>

        {/* Server URL — always visible, editable only in url mode */}
        <Text style={styles.label}>Server URL</Text>
        <TextInput
          style={[styles.input, mode !== "url" && styles.inputLocked]}
          placeholder="https://your-instance.com"
          placeholderTextColor="#9ca3af"
          value={serverUrl}
          onChangeText={setServerUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          editable={mode === "url" && !loading}
        />

        {mode === "url" && (
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleConnect}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Connect</Text>
            )}
          </TouchableOpacity>
        )}

        {mode === "setup" && (
          <>
            <Text style={styles.setupHeading}>Create Admin Account</Text>
            <Text style={styles.setupDescription}>
              This server has not been set up yet. Create the first admin account to get started.
            </Text>

            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              placeholder="Username"
              placeholderTextColor="#9ca3af"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#9ca3af"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!loading}
            />

            <Text style={styles.label}>Confirm Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Confirm Password"
              placeholderTextColor="#9ca3af"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              editable={!loading}
            />

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSetup}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Create Account</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => { setMode("url"); setUsername(""); setPassword(""); setConfirmPassword(""); }}
              activeOpacity={0.7}
            >
              <Text style={styles.backText}>← Change server</Text>
            </TouchableOpacity>
          </>
        )}

        {mode === "login" && (
          <>
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              placeholder="Username"
              placeholderTextColor="#9ca3af"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#9ca3af"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!loading}
            />

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Sign In</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.forgotBtn}
              onPress={handleForgotPassword}
              activeOpacity={0.7}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => { setMode("url"); setUsername(""); setPassword(""); }}
              activeOpacity={0.7}
            >
              <Text style={styles.backText}>← Change server</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  inner: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  logo: {
    fontSize: 30,
    fontWeight: "bold",
    color: "#111827",
    textAlign: "center",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 32,
  },
  setupHeading: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
    marginTop: 16,
    marginBottom: 4,
  },
  setupDescription: {
    fontSize: 13,
    color: "#6b7280",
    lineHeight: 18,
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: "500",
    color: "#374151",
    marginBottom: 4,
    marginTop: 4,
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#111827",
    marginBottom: 12,
  },
  inputLocked: {
    backgroundColor: "#f3f4f6",
    color: "#6b7280",
  },
  button: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  forgotBtn: {
    alignItems: "center",
    marginTop: 16,
    paddingVertical: 6,
  },
  forgotText: {
    color: "#6b7280",
    fontSize: 14,
  },
  backBtn: {
    alignItems: "center",
    marginTop: 8,
    paddingVertical: 6,
  },
  backText: {
    color: "#6b7280",
    fontSize: 13,
  },
});
