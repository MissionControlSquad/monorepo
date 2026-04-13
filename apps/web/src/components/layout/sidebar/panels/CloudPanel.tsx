"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Server, Plus } from "lucide-react";
import { SidebarPanelHeader } from "../SidebarPanelHeader";
import { SidebarSkeleton } from "../SidebarSkeleton";
import { SidebarEmptyState } from "../SidebarEmptyState";
import { CLOUD_VM_STATUS_LABELS } from "@agentcenter/utils";
import { CloudVmStatus } from "@/server/constants";

interface CloudVM {
  id: string;
  name?: string | null;
  serverName?: string | null;
  status: string;
  ipv4?: string | null;
}

const STATUS_COLORS: Record<string, { dot: string; text: string }> = {
  running: { dot: "bg-success", text: "text-success" },
  stopped: { dot: "bg-muted-foreground", text: "text-muted-foreground" },
  error: { dot: "bg-destructive", text: "text-destructive" },
  provisioning: { dot: "bg-primary", text: "text-primary" },
  waiting_for_ssh: { dot: "bg-primary", text: "text-primary" },
  installing_deps: { dot: "bg-primary", text: "text-primary" },
  installing_openclaw: { dot: "bg-primary", text: "text-primary" },
  configuring: { dot: "bg-primary", text: "text-primary" },
  starting_service: { dot: "bg-primary", text: "text-primary" },
  destroying: { dot: "bg-warning", text: "text-warning" },
};

// Sidebar uses abbreviated labels for compact display
const STATUS_LABELS: Record<string, string> = {
  ...CLOUD_VM_STATUS_LABELS,
  waiting_for_ssh: "SSH...",
  installing_deps: "Installing",
  installing_openclaw: "Installing",
  starting_service: "Starting",
};

export function CloudPanel() {
  const pathname = usePathname();
  const [vms, setVMs] = useState<CloudVM[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchVMs = useCallback(async () => {
    try {
      const res = await fetch("/api/cloud-vms");
      if (res.ok) {
        const data = await res.json();
        setVMs(data.vms || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVMs();
  }, [fetchVMs]);

  // Poll while transitional
  useEffect(() => {
    const TRANSITIONAL: string[] = [
      CloudVmStatus.PROVISIONING,
      CloudVmStatus.WAITING_FOR_SSH,
      CloudVmStatus.INSTALLING_DEPS,
      CloudVmStatus.INSTALLING_OPENCLAW,
      CloudVmStatus.CONFIGURING,
      CloudVmStatus.STARTING_SERVICE,
      CloudVmStatus.DESTROYING,
    ];
    const hasTransitional = vms.some((vm) => TRANSITIONAL.includes(vm.status));
    if (!hasTransitional) return;
    const interval = setInterval(fetchVMs, 5000);
    return () => clearInterval(interval);
  }, [vms, fetchVMs]);

  const runningCount = vms.filter((vm) => vm.status === CloudVmStatus.RUNNING).length;

  return (
    <div className="h-full flex flex-col">
      <SidebarPanelHeader
        title="Cloud"
        action={
          <Link
            href="/cloud"
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/10 rounded-md transition-colors"
          >
            Manage
          </Link>
        }
      />
      {vms.length > 0 && (
        <p className="text-[11px] text-muted-foreground px-4 -mt-1 pb-1">
          {runningCount} of {vms.length} running
        </p>
      )}

      <div className="flex-1 overflow-y-auto py-1 px-2">
        {loading ? (
          <SidebarSkeleton />
        ) : vms.length === 0 ? (
          <SidebarEmptyState
            icon={<Server />}
            message="No VMs yet"
            action={
              <Link
                href="/cloud"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 rounded-lg transition-colors"
              >
                <Plus className="w-3 h-3" />
                Create a VM
              </Link>
            }
          />
        ) : (
          <ul className="space-y-0.5">
            {vms.map((vm) => {
              const colors = STATUS_COLORS[vm.status] || STATUS_COLORS.error;
              const label = STATUS_LABELS[vm.status] || vm.status;
              const isActive = pathname === `/cloud/${vm.id}`;
              return (
                <li key={vm.id}>
                  <Link
                    href={`/cloud/${vm.id}`}
                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] transition-colors ${
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colors.dot}`} />
                    <span className="truncate flex-1 min-w-0">
                      {vm.name || vm.serverName || vm.id.slice(0, 8)}
                    </span>
                    <span className={`text-[10px] font-medium flex-shrink-0 ${colors.text}`}>
                      {label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
