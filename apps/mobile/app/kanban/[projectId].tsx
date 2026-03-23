import { useEffect } from "react";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { KanbanBoard } from "../../src/components/KanbanBoard";

export default function KanbanScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions({ title: "Kanban" });
  }, []);

  return <KanbanBoard projectId={projectId} />;
}
