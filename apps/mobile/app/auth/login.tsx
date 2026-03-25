import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
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
      className="flex-1 bg-gray-50 dark:bg-slate-900"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View className="flex-1 justify-center px-6 pb-10">
        <Text className="text-[30px] font-bold text-gray-900 dark:text-slate-100 text-center mb-1">
          AgentCenter
        </Text>
        <Text className="text-sm text-gray-500 dark:text-slate-400 text-center mb-8">
          Mission Control
        </Text>

        {/* Server URL — always visible, editable only in url mode */}
        <Text className="text-[13px] font-medium text-gray-700 dark:text-slate-300 mb-1 mt-1">
          Server URL
        </Text>
        <TextInput
          className={`bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-[10px] px-4 py-3.5 text-base text-gray-900 dark:text-slate-100 mb-3 ${mode !== "url" ? "bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400" : ""}`}
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
            className={`bg-blue-600 dark:bg-blue-500 rounded-[10px] py-3.5 items-center mt-2 ${loading ? "opacity-60" : ""}`}
            onPress={handleConnect}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white text-base font-semibold">Connect</Text>
            )}
          </TouchableOpacity>
        )}

        {mode === "setup" && (
          <>
            <Text className="text-[17px] font-bold text-gray-900 dark:text-slate-100 mt-4 mb-1">
              Create Admin Account
            </Text>
            <Text className="text-[13px] text-gray-500 dark:text-slate-400 leading-[18px] mb-4">
              This server has not been set up yet. Create the first admin account to get started.
            </Text>

            <Text className="text-[13px] font-medium text-gray-700 dark:text-slate-300 mb-1 mt-1">Username</Text>
            <TextInput
              className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-[10px] px-4 py-3.5 text-base text-gray-900 dark:text-slate-100 mb-3"
              placeholder="Username"
              placeholderTextColor="#9ca3af"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />

            <Text className="text-[13px] font-medium text-gray-700 dark:text-slate-300 mb-1 mt-1">Password</Text>
            <TextInput
              className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-[10px] px-4 py-3.5 text-base text-gray-900 dark:text-slate-100 mb-3"
              placeholder="Password"
              placeholderTextColor="#9ca3af"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!loading}
            />

            <Text className="text-[13px] font-medium text-gray-700 dark:text-slate-300 mb-1 mt-1">Confirm Password</Text>
            <TextInput
              className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-[10px] px-4 py-3.5 text-base text-gray-900 dark:text-slate-100 mb-3"
              placeholder="Confirm Password"
              placeholderTextColor="#9ca3af"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              editable={!loading}
            />

            <TouchableOpacity
              className={`bg-blue-600 dark:bg-blue-500 rounded-[10px] py-3.5 items-center mt-2 ${loading ? "opacity-60" : ""}`}
              onPress={handleSetup}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white text-base font-semibold">Create Account</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              className="items-center mt-4 py-1.5"
              onPress={() => { setMode("url"); setUsername(""); setPassword(""); setConfirmPassword(""); }}
              activeOpacity={0.7}
            >
              <Text className="text-gray-500 dark:text-slate-400 text-[13px]">← Change server</Text>
            </TouchableOpacity>
          </>
        )}

        {mode === "login" && (
          <>
            <Text className="text-[13px] font-medium text-gray-700 dark:text-slate-300 mb-1 mt-1">Username</Text>
            <TextInput
              className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-[10px] px-4 py-3.5 text-base text-gray-900 dark:text-slate-100 mb-3"
              placeholder="Username"
              placeholderTextColor="#9ca3af"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />

            <Text className="text-[13px] font-medium text-gray-700 dark:text-slate-300 mb-1 mt-1">Password</Text>
            <TextInput
              className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-[10px] px-4 py-3.5 text-base text-gray-900 dark:text-slate-100 mb-3"
              placeholder="Password"
              placeholderTextColor="#9ca3af"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!loading}
            />

            <TouchableOpacity
              className={`bg-blue-600 dark:bg-blue-500 rounded-[10px] py-3.5 items-center mt-2 ${loading ? "opacity-60" : ""}`}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white text-base font-semibold">Sign In</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              className="items-center mt-4 py-1.5"
              onPress={handleForgotPassword}
              activeOpacity={0.7}
            >
              <Text className="text-gray-500 dark:text-slate-400 text-sm">Forgot password?</Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="items-center mt-2 py-1.5"
              onPress={() => { setMode("url"); setUsername(""); setPassword(""); }}
              activeOpacity={0.7}
            >
              <Text className="text-gray-500 dark:text-slate-400 text-[13px]">← Change server</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
