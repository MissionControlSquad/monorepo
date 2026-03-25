import { Text } from "react-native";

export function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wide">
      {children}
    </Text>
  );
}
