import { Redirect, useRouter } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "../src/context/AuthContext";
import { getStoredCookie } from "../src/api/session";
import { useEffect, useState } from "react";

export default function Index() {
  const { isLoading, isSignedIn, serverUrl } = useAuth();
  const router = useRouter();
  const [checkingOnboarding, setCheckingOnboarding] = useState(false);

  useEffect(() => {
    if (!isSignedIn || !serverUrl || isLoading) return;

    // Check if onboarding is needed
    setCheckingOnboarding(true);
    const cookie = getStoredCookie();
    const headers: Record<string, string> = {};
    if (cookie) headers.Cookie = `mc_session=${cookie}`;

    fetch(`${serverUrl}/api/onboarding`, { credentials: "include", headers })
      .then((r) => r.json())
      .then((data: { completed?: boolean; categoryId?: string | null }) => {
        if (data.completed === false) {
          const params = data.categoryId ? `?resumeCategory=${data.categoryId}` : "";
          router.replace(`/onboarding${params}` as Parameters<typeof router.replace>[0]);
        } else {
          router.replace("/(dashboard)");
        }
      })
      .catch(() => {
        // On error, go to dashboard
        router.replace("/(dashboard)");
      })
      .finally(() => setCheckingOnboarding(false));
  }, [isSignedIn, serverUrl, isLoading]);

  if (isLoading || checkingOnboarding) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!isSignedIn) {
    return <Redirect href="/auth/login" />;
  }

  // Redirect handled by useEffect above; show spinner while resolving
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator size="large" color="#2563eb" />
    </View>
  );
}
