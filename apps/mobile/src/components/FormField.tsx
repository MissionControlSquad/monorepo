import { View, Text } from "react-native";

export function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300">
        {label}
        {required ? " *" : ""}
      </Text>
      {children}
    </View>
  );
}
