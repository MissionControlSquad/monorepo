import { Tabs } from "expo-router";

export default function DashboardLayout() {
  return (
    <Tabs>
      <Tabs.Screen
        name="index"
        options={{
          title: "Tasks",
          tabBarLabel: "Tasks",
        }}
      />
      <Tabs.Screen
        name="channels"
        options={{
          title: "Messages",
          tabBarLabel: "Messages",
        }}
      />
      <Tabs.Screen
        name="agents"
        options={{
          title: "Agents",
          tabBarLabel: "Agents",
        }}
      />
    </Tabs>
  );
}
