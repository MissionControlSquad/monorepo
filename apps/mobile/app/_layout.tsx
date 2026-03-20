import "../global.css";
import { Stack } from "expo-router";
import { Provider } from "urql";
import { AuthProvider, useAuth } from "../src/context/AuthContext";

function RootLayoutNav() {
  const { isLoading, isSignedIn, urqlClient } = useAuth();

  if (isLoading) return null;

  // Wrap in Provider only when signed in and client is ready
  const content = (
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

  return urqlClient ? <Provider value={urqlClient}>{content}</Provider> : content;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
