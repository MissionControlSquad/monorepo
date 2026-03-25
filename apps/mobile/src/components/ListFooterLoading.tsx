import { TouchableOpacity, Text, ActivityIndicator } from "react-native";

export function ListFooterLoading({
  hasMore,
  fetching,
  onLoadMore,
}: {
  hasMore: boolean;
  fetching: boolean;
  onLoadMore: () => void;
}) {
  if (!hasMore) return null;
  return (
    <TouchableOpacity
      className="mt-2 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 items-center"
      onPress={onLoadMore}
      disabled={fetching}
      activeOpacity={0.7}
    >
      {fetching ? (
        <ActivityIndicator size="small" color="#2563eb" />
      ) : (
        <Text className="text-sm text-blue-600 dark:text-blue-400 font-semibold">Load more</Text>
      )}
    </TouchableOpacity>
  );
}
