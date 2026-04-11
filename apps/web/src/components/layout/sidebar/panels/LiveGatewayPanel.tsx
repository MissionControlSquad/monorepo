"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Zap } from "lucide-react";
import { SidebarPanelHeader } from "../SidebarPanelHeader";
import { SidebarSkeleton } from "../SidebarSkeleton";
import { SidebarEmptyState } from "../SidebarEmptyState";

interface LiveConnection {
  id: string;
  machineName: string | null;
  connectionStatus: string;
  agentSlugs: string[];
}

export function LiveGatewayPanel() {
  const [connections, setConnections] = useState<LiveConnection[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConnections = useCallback(async () => {
    try {
      const res = await fetch("/api/live-gateway/connections");
      if (res.ok) {
        const data = await res.json();
        setConnections(data.connections || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnections();
    // Refresh every 30s to pick up new connections
    const interval = setInterval(fetchConnections, 30_000);
    return () => clearInterval(interval);
  }, [fetchConnections]);

  const liveCount = connections.filter((c) => c.connectionStatus === "connected").length;

  return (
    <div className="h-full flex flex-col">
      <SidebarPanelHeader
        title="Live Gateway"
        action={
          <Link
            href="/live-gateway"
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/10 rounded-md transition-colors"
          >
            Manage
          </Link>
        }
      />
      {connections.length > 0 && (
        <p className="text-[11px] text-muted-foreground px-4 -mt-1 pb-1">
          {liveCount} of {connections.length} connected
        </p>
      )}

      <div className="flex-1 overflow-y-auto py-1 px-2">
        {loading ? (
          <SidebarSkeleton />
        ) : connections.length === 0 ? (
          <SidebarEmptyState
            icon={<Zap />}
            message="No machines connected"
            action={
              <Link
                href="/live-gateway"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 rounded-lg transition-colors"
              >
                Get started
              </Link>
            }
          />
        ) : (
          <ul className="space-y-0.5">
            {connections.map((conn) => {
              const isLive = conn.connectionStatus === "connected";
              return (
                <li key={conn.id}>
                  <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-foreground">
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        isLive ? "bg-success" : "bg-muted-foreground"
                      }`}
                    />
                    <span className="truncate flex-1 min-w-0">
                      {conn.machineName || conn.id.slice(0, 8)}
                    </span>
                    <span
                      className={`text-[10px] font-medium flex-shrink-0 ${
                        isLive ? "text-success" : "text-muted-foreground"
                      }`}
                    >
                      {isLive ? "Live" : "Off"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
