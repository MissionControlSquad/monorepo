import { useEffect, useRef, useState } from "react";
import { Platform, Alert } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { useRouter } from "expo-router";

/**
 * Configure how notifications are presented when the app is in the foreground.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function usePushNotifications() {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const router = useRouter();

  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    registerForPushNotifications().then((token) => {
      if (token) setExpoPushToken(token);
    });

    // Fires when a notification is received while app is in foreground
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (_notification) => {
        // Badge is updated automatically via setNotificationHandler
      }
    );

    // Fires when user taps a notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as Record<string, unknown>;
        handleNotificationTap(data, router);
      }
    );

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [router]);

  return { expoPushToken };
}

async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    // Push notifications only work on physical devices
    return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#2563eb",
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    return null;
  }

  try {
    const token = await Notifications.getExpoPushTokenAsync();
    return token.data;
  } catch {
    return null;
  }
}

function handleNotificationTap(
  data: Record<string, unknown>,
  router: ReturnType<typeof useRouter>
) {
  // Route to the relevant screen based on notification payload
  if (data.taskId) {
    router.push(`/task/${data.taskId}` as Parameters<typeof router.push>[0]);
  } else if (data.channelId) {
    router.push(`/channels/${data.channelId}` as Parameters<typeof router.push>[0]);
  } else if (data.projectId) {
    router.push(`/project/${data.projectId}` as Parameters<typeof router.push>[0]);
  } else {
    router.push("/notifications");
  }
}
