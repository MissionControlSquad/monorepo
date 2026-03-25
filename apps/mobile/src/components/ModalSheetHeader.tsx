import { View, Text, TouchableOpacity } from "react-native";

export function ModalSheetHeader({
  title,
  onClose,
  closeLabel = "Done",
}: {
  title: string;
  onClose: () => void;
  closeLabel?: string;
}) {
  return (
    <View className="flex-row justify-between items-center p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
      <Text className="text-lg font-semibold text-gray-900 dark:text-slate-100">{title}</Text>
      <TouchableOpacity onPress={onClose}>
        <Text className="text-base font-semibold text-blue-600 dark:text-blue-400">{closeLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}
