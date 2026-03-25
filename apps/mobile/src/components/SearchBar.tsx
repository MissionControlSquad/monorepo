import { View, TextInput, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  /** Optional element rendered on the right side (e.g. a "+ New" button). */
  right?: React.ReactNode;
  autoFocus?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}

/**
 * Consistent search bar used across screens.
 * Renders a row with a search icon, text input, and optional right-side slot.
 */
export function SearchBar({
  value,
  onChangeText,
  placeholder = "Search…",
  right,
  autoFocus = false,
  autoCapitalize = "none",
}: SearchBarProps) {
  return (
    <View className="flex-row items-center bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-3 py-2 gap-2">
      <Ionicons name="search-outline" size={16} color="#9ca3af" />
      <TextInput
        className="flex-1 text-base text-gray-900 dark:text-slate-100 py-1 px-1"
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        value={value}
        onChangeText={onChangeText}
        clearButtonMode="while-editing"
        returnKeyType="search"
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        autoFocus={autoFocus}
      />
      {right ?? null}
    </View>
  );
}
