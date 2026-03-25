"use client";

import { useState, useCallback } from "react";
import { usePollingInterval, useSearch } from "@agentcenter/hooks";
import Link from "next/link";
import { Server, Plus, Loader2, Globe, Cpu, Clock, Search } from "lucide-react";
import { CreateVMDialog } from "../components/cloud/CreateVMDialog";
import { Breadcrumbs, Button, Badge, Card, Input, EmptyState, PageLayout } from "../components/ui";
import { formatUptime, CLOUD_VM_TRANSITIONAL_STATUSES } from "@agentcenter/utils";
import { ErrorBoundary, PanelErrorFallback } from "../components/common/ErrorBoundary";

interface CloudVMAgent {
  id: string;
  name: string;
  identityEmoji?: string | null;
  username?: string | null;
}

interface CloudVM {
  id: string;
  name?: string | null;
  serverName?: string | null;
  status: string;
  ipv4?: string | null;
  region: string;
  serverType: string;
  totalUptimeSeconds: number;
  estimatedCostCents: number;
  agents: CloudVMAgent[];
  _count: { agents: number };
  createdAt: string;
}

const STATUS_BADGE_VARIANT: Record<
  string,
  { label: string; variant: "blue" | "indigo" | "purple" | "green" | "gray" | "red" | "orange" }
> = {
  provisioning: { label: "Provisioning", variant: "blue" },
  waiting_for_ssh: { label: "Waiting for SSH", variant: "blue" },
  installing_deps: { label: "Installing Deps", variant: "indigo" },
  installing_openclaw: { label: "Installing OpenClaw", variant: "indigo" },
  configuring: { label: "Configuring", variant: "purple" },
  starting_service: { label: "Starting Service", variant: "purple" },
  running: { label: "Running", variant: "green" },
  stopped: { label: "Stopped", variant: "gray" },
  error: { label: "Error", variant: "red" },
  destroying: { label: "Destroying", variant: "orange" },
};

export function CloudPage() {
  const [vms, setVMs] = useState<CloudVM[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

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

  const hasTransitional = vms.some((vm) => CLOUD_VM_TRANSITIONAL_STATUSES.includes(vm.status));
  usePollingInterval(fetchVMs, 5000, hasTransitional);

  const { search, setSearch, filtered } = useSearch(vms, (vm, q) => {
    const name = (vm.name || vm.serverName || vm.id).toLowerCase();
    return (
      name.includes(q) ||
      (vm.ipv4 || "").includes(q) ||
      vm.region.toLowerCase().includes(q) ||
      vm.status.toLowerCase().includes(q) ||
      vm.agents.some((a) => a.name.toLowerCase().includes(q))
    );
  });

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  const isEmpty = vms.length === 0;

  if (isEmpty) {
    return (
      <>
        <EmptyState
          icon={<Server />}
          title="No cloud VMs yet"
          description="Create a virtual machine to deploy your agents to the cloud. Multiple agents can share a single VM."
          action={
            <Button
              variant="primary"
              size="lg"
              icon={<Plus />}
              onClick={() => setShowCreateDialog(true)}
            >
              Create VM
            </Button>
          }
        />
        {showCreateDialog && (
          <CreateVMDialog
            onClose={() => setShowCreateDialog(false)}
            onCreated={() => {
              setShowCreateDialog(false);
              fetchVMs();
            }}
          />
        )}
      </>
    );
  }

  return (
    <PageLayout>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Cloud" }]} />
      <ErrorBoundary
        fallback={({ resetErrorBoundary, error }) => (
          <PanelErrorFallback label="Cloud VMs" error={error} onRetry={resetErrorBoundary} />
        )}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Cloud</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {vms.length} virtual machine{vms.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Button variant="primary" icon={<Plus />} onClick={() => setShowCreateDialog(true)}>
            Create VM
          </Button>
        </div>

        {/* Search */}
        <div className="mb-5">
          <Input
            placeholder="Search VMs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            icon={<Search />}
          />
        </div>

        {(() => {
          if (filtered.length === 0) {
            return (
              <EmptyState
                icon={<Search />}
                title="No matching VMs"
                description="Try adjusting your search."
              />
            );
          }

          return (
            <Card className="overflow-hidden divide-y divide-border">
              {filtered.map((vm) => {
                const badgeInfo = STATUS_BADGE_VARIANT[vm.status] || STATUS_BADGE_VARIANT.error;
                const statusDot =
                  vm.status === "running"
                    ? "bg-success"
                    : vm.status === "error"
                      ? "bg-destructive"
                      : "bg-gray-400";
                return (
                  <Link
                    key={vm.id}
                    href={`/cloud/${vm.id}`}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-muted transition-all group"
                  >
                    {/* Status dot + Name */}
                    <div className="flex items-center gap-3 min-w-0 w-[220px] flex-shrink-0">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot}`} />
                      <span className="font-medium text-foreground truncate group-hover:text-indigo-600 transition-colors">
                        {vm.name || vm.serverName || vm.id.slice(0, 8)}
                      </span>
                    </div>

                    {/* Status badge */}
                    <Badge variant={badgeInfo.variant}>{badgeInfo.label}</Badge>

                    {/* IP */}
                    <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground w-[130px] flex-shrink-0">
                      <Globe className="w-3 h-3 text-muted-foreground" />
                      <span className="font-mono">{vm.ipv4 || "—"}</span>
                    </div>

                    {/* Spec + Region */}
                    <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground w-[140px] flex-shrink-0">
                      <Cpu className="w-3 h-3 text-muted-foreground" />
                      <span>
                        {vm.serverType} / {vm.region}
                      </span>
                    </div>

                    {/* Uptime */}
                    <div className="hidden lg:flex items-center gap-1.5 text-xs text-muted-foreground w-[80px] flex-shrink-0">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span>{formatUptime(vm.totalUptimeSeconds)}</span>
                    </div>

                    {/* Agents */}
                    <div className="flex items-center gap-1 ml-auto flex-shrink-0">
                      {vm.agents.length > 0 ? (
                        <>
                          {vm.agents.slice(0, 4).map((agent) => (
                            <div
                              key={agent.id}
                              className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs"
                              title={agent.name}
                            >
                              {agent.identityEmoji || agent.name[0]}
                            </div>
                          ))}
                          {vm.agents.length > 4 && (
                            <span className="text-xs text-muted-foreground ml-0.5">
                              +{vm.agents.length - 4}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">No agents</span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </Card>
          );
        })()}

        {showCreateDialog && (
          <CreateVMDialog
            onClose={() => setShowCreateDialog(false)}
            onCreated={() => {
              setShowCreateDialog(false);
              fetchVMs();
            }}
          />
        )}
      </ErrorBoundary>
    </PageLayout>
  );
}
