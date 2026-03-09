import { Stack } from "expo-router";
import { useEffect } from "react";
import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    // Check if user is authenticated on app start
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = await SecureStore.getItemAsync("auth_token");
      if (!token) {
        router.replace("/auth/login");
      }
    } catch (error) {
      console.error("Auth check failed:", error);
      router.replace("/auth/login");
    }
  };

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: "#000",
        headerTitleStyle: {
          fontWeight: "600",
        },
      }}
    >
      <Stack.Screen
        name="auth"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="(tabs)"
        options={{
          headerShown: false,
        }}
      />
    </Stack>
  );
}
