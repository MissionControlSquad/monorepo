"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Radio } from "lucide-react";
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
            href="/live-gateway?wizard=open"
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/10 rounded-md transition-colors"
          >
            Connect
          </Link>
        }
      />

      {connections.length > 0 && (
        <div className="flex items-center gap-1.5 px-4 -mt-1 pb-2">
          <span
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              liveCount > 0 ? "bg-success animate-pulse" : "bg-muted-foreground"
            }`}
          />
          <p className="text-[11px] text-muted-foreground">
            {liveCount > 0
              ? `${liveCount} of ${connections.length} live`
              : `${connections.length} machine${connections.length !== 1 ? "s" : ""}, none live`}
          </p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-1 px-2">
        {loading ? (
          <SidebarSkeleton />
        ) : connections.length === 0 ? (
          <SidebarEmptyState
            icon={<Radio />}
            message="No machines connected"
            action={
              <Link
                href="/live-gateway?wizard=open"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 rounded-lg transition-colors"
              >
                Set up a machine
              </Link>
            }
          />
        ) : (
          <ul className="space-y-0.5">
            {connections.map((conn) => {
              const isLive = conn.connectionStatus === "connected";
              const agentCount = conn.agentSlugs?.length ?? 0;
              return (
                <li key={conn.id}>
                  <div className="flex items-start gap-2.5 px-2.5 py-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <span className="mt-[5px] flex-shrink-0 relative">
                      <span
                        className={`block w-2 h-2 rounded-full ${
                          isLive ? "bg-success" : "bg-muted-foreground/40"
                        }`}
                      />
                      {isLive && (
                        <span className="absolute inset-0 rounded-full bg-success animate-ping opacity-60" />
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[13px] text-foreground truncate">
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
                      {agentCount > 0 && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {agentCount} agent{agentCount !== 1 ? "s" : ""}
                        </p>
                      )}
                    </div>
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
