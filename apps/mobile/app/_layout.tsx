import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";

export default function RootLayout() {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = await SecureStore.getItemAsync("authToken");
        setIsSignedIn(!!token);
      } catch (error) {
        console.error("Auth check failed:", error);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  if (isLoading) {
    return null;
  }

  return (
    <Stack>
      {!isSignedIn ? (
        <Stack.Screen name="auth/login" options={{ headerShown: false }} />
      ) : (
        <>
          <Stack.Screen name="(dashboard)" options={{ headerShown: false }} />
          <Stack.Screen name="task/[id]" options={{ title: "Task Details" }} />
          <Stack.Screen name="channels/[id]" options={{ title: "Channel" }} />
        </>
      )}
    </Stack>
  );
}
