import { Redirect, useRouter } from "expo-router";
import { ActivityIndicator, Alert, View } from "react-native";
import { useAuth } from "../src/context/AuthContext";
import { getStoredCookie } from "../src/api/session";
import { useEffect, useState } from "react";
import { fetchLicenseStatus, fetchOnboardingStatus } from "@agentcenter/utils";

export default function Index() {
  const { isLoading, isSignedIn, serverUrl } = useAuth();
  const router = useRouter();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!isSignedIn || !serverUrl || isLoading) return;

    setChecking(true);
    const cookie = getStoredCookie();
    const headers: Record<string, string> = {};
    if (cookie) headers.Cookie = `mc_session=${cookie}`;

    // Check license first, then onboarding
    fetchLicenseStatus(serverUrl, headers)
      .then(({ status }) => {
        if (status === "none" || status === "expired") {
          router.replace("/(dashboard)");
          Alert.alert(
            status === "none" ? "License Required" : "License Expired",
            status === "none"
              ? "This server has no active license. Please activate a license in Settings."
              : "Your license has expired. Please renew it in Settings.",
            [{ text: "Go to Settings", onPress: () => router.push("/settings" as Parameters<typeof router.push>[0]) }],
          );
          return Promise.reject("license-gate");
        }
      })
      .then(() => fetchOnboardingStatus(serverUrl, headers))
      .then((data) => {
        if (data.completed === false) {
          const params = data.categoryId ? `?resumeCategory=${data.categoryId}` : "";
          router.replace(`/onboarding${params}` as Parameters<typeof router.replace>[0]);
        } else {
          router.replace("/(dashboard)");
        }
      })
      .catch((err) => {
        if (err !== "license-gate") {
          // On unexpected error, go to dashboard
          router.replace("/(dashboard)");
        }
      })
      .finally(() => setChecking(false));
  }, [isSignedIn, serverUrl, isLoading]);

  if (isLoading || checking) {
    return (
      <View className="flex-1 justify-center items-center">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!isSignedIn) {
    return <Redirect href="/auth/login" />;
  }

  // Redirect handled by useEffect above; show spinner while resolving
  return (
    <View className="flex-1 justify-center items-center">
      <ActivityIndicator size="large" color="#2563eb" />
    </View>
  );
}
