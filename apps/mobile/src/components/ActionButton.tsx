import { TouchableOpacity, Text, ActivityIndicator } from "react-native";

export function ActionButton({
  label,
  onPress,
  loading = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const isDisabled = disabled || loading;
  return (
    <TouchableOpacity
      className={`bg-blue-600 rounded-xl py-3.5 items-center ${isDisabled ? "opacity-50" : ""}`}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text className="text-white text-base font-semibold">{label}</Text>
      )}
    </TouchableOpacity>
  );
}
