"use client";

import { useEffect, useState } from "react";
import { useSubscription } from "urql";

const VM_CONNECTION_SUBSCRIPTION = `
  subscription VMConnectionChanged($vmId: String!) {
    vmConnectionChanged(vmId: $vmId) {
      vmId
      connected
    }
  }
`;

interface Props {
  vmId: string;
  initialStatus: string; // "connected" | "disconnected"
}

export function VMConnectionBadge({ vmId, initialStatus }: Props) {
  const [connected, setConnected] = useState(initialStatus === "connected");

  const [result] = useSubscription({
    query: VM_CONNECTION_SUBSCRIPTION,
    variables: { vmId },
  });

  useEffect(() => {
    const event = result.data?.vmConnectionChanged;
    if (event) setConnected(event.connected);
  }, [result.data]);

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
        connected
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
          : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
      }`}
      title={connected ? "Plugin connected" : "Plugin offline"}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-gray-400"}`}
      />
      {connected ? "Live" : "Offline"}
    </span>
  );
}
