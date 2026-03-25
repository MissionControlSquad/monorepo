import { TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

export function FAB({
  onPress,
  icon = "add",
}: {
  onPress: () => void;
  icon?: IoniconName;
}) {
  const insets = useSafeAreaInsets();
  return (
    <TouchableOpacity
      className="absolute right-5 w-14 h-14 rounded-full bg-blue-600 justify-center items-center"
      style={{
        bottom: insets.bottom + 20,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
        elevation: 6,
      }}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Ionicons name={icon} size={26} color="#fff" />
    </TouchableOpacity>
  );
}
