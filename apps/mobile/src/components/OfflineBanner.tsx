import { useEffect, useRef } from "react";
import { Text, Animated } from "react-native";
import { useNetworkStatus } from "../hooks/useNetworkError";

export function OfflineBanner() {
  const { isOnline } = useNetworkStatus();
  const translateY = useRef(new Animated.Value(-50)).current;

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: isOnline ? -50 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isOnline, translateY]);

  return (
    <Animated.View
      className="absolute top-0 left-0 right-0 bg-red-500 py-2.5 items-center z-[9999]"
      style={{ transform: [{ translateY }] }}
      pointerEvents="none"
    >
      <Text className="text-white text-sm font-semibold">
        ⚠️ No connection — check your network
      </Text>
    </Animated.View>
  );
}
