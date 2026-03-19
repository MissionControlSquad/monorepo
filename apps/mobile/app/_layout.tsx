import "../global.css";
import { Stack } from "expo-router";
import { Provider } from "urql";
import { urqlClient } from "../src/api/client";
import { AuthProvider, useAuth } from "../src/context/AuthContext";

function RootLayoutNav() {
  const { isLoading, isSignedIn } = useAuth();

  if (isLoading) return null;

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

export default function RootLayout() {
  return (
    <AuthProvider>
      <Provider value={urqlClient}>
        <RootLayoutNav />
      </Provider>
    </AuthProvider>
  );
}
