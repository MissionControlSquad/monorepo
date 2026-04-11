"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Server,
  Power,
  PowerOff,
  Trash2,
  RefreshCw,
  Loader2,
  AlertCircle,
  Clock,
  Globe,
  Cpu,
  Users,
  RotateCcw,
  Shield,
  Check,
  ChevronLeft,
  Terminal,
  Maximize2,
  Minimize2,
  X,
  Wrench,
  Pencil,
  ChevronDown,
  Box,
} from "lucide-react";
import {
  LLM_PROVIDERS,
  LLM_PROVIDERS_MAP,
  PROVIDER_COLORS,
  formatUptime,
  formatCost,
} from "@agentcenter/utils";
import { toast } from "sonner";
import { Breadcrumbs, Button, Badge, Card, ConfirmDialog, Input } from "../components/ui";
import { VMConnectionBadge } from "../components/cloud/VMConnectionBadge";
import { useSubscription } from "urql";

const VM_CONNECTION_SUB = `
  subscription VMConnectionChanged($vmId: String!) {
    vmConnectionChanged(vmId: $vmId) { vmId connected }
  }
`;

function LiveGatewayStatus({
  vmId,
  initialStatus,
  connectedAt,
  lastDisconnectedAt,
  pluginVersion,
}: {
  vmId: string;
  initialStatus: string;
  connectedAt: string | null;
  lastDisconnectedAt: string | null;
  pluginVersion: string | null;
}) {
  const [connected, setConnected] = useState(initialStatus === "connected");
  const [result] = useSubscription({ query: VM_CONNECTION_SUB, variables: { vmId } });

  useEffect(() => {
    const e = result.data?.vmConnectionChanged;
    if (e) setConnected(e.connected);
  }, [result.data]);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Live Gateway</h3>
        <VMConnectionBadge vmId={vmId} initialStatus={initialStatus} />
      </div>
      <div className="grid grid-cols-3 gap-4 text-xs">
        <div>
          <p className="text-muted-foreground mb-1">Status</p>
          <p className="text-foreground font-medium">
            {connected ? "Plugin connected" : "Plugin offline"}
          </p>
        </div>
        {pluginVersion && (
          <div>
            <p className="text-muted-foreground mb-1">Plugin version</p>
            <p className="text-foreground font-mono">{pluginVersion}</p>
          </div>
        )}
        <div>
          <p className="text-muted-foreground mb-1">{connected ? "Connected at" : "Last seen"}</p>
          <p className="text-foreground">
            {connected && connectedAt
              ? new Date(connectedAt).toLocaleString()
              : lastDisconnectedAt
                ? new Date(lastDisconnectedAt).toLocaleString()
                : "Never"}
          </p>
        </div>
      </div>
    </Card>
  );
}

interface VMAgent {
  id: string;
  name: string;
  username?: string | null;
  identityEmoji?: string | null;
  status: string;
  llmModel?: string | null;
}

interface CloudVM {
  id: string;
  name?: string | null;
  status: string;
  connectionStatus?: string;
  connectedAt?: string | null;
  lastDisconnectedAt?: string | null;
  pluginVersion?: string | null;
  ipv4?: string | null;
  region: string;
  serverType: string;
  serverName?: string | null;
  totalUptimeSeconds: number;
  estimatedCostCents: number;
  errorMessage?: string | null;
  setupStep?: string | null;
  setupProgress?: number;
  llmConfigured: boolean;
  llmProvider?: string | null;
  llmModel?: string | null;
  agents: VMAgent[];
  createdAt: string;
}

interface VMLog {
  id: string;
  message: string;
  level: string;
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
  destroyed: { label: "Destroyed", variant: "gray" },
};

const SETUP_STATES = [
  "provisioning",
  "waiting_for_ssh",
  "installing_deps",
  "installing_openclaw",
  "configuring",
  "starting_service",
];

const STEP_LABELS: Record<string, string> = {
  creating_server: "Creating server...",
  waiting_for_server: "Waiting for server...",
  waiting_for_hetzner: "Waiting for Hetzner...",
  waiting_for_ssh: "Connecting via SSH...",
  apt_update: "Installing system packages...",
  install_nodejs: "Installing Node.js 22...",
  install_openclaw: "Installing OpenClaw...",
  setup_workspace: "Setting up workspace...",
  start_daemon: "Starting OpenClaw daemon...",
  retrying: "Retrying provisioning...",
};

interface CloudVMDetailPageProps {
  vmId: string;
}

export function CloudVMDetailPage({ vmId }: CloudVMDetailPageProps) {
  const router = useRouter();
  const [vm, setVM] = useState<CloudVM | null>(null);
  const [logs, setLogs] = useState<VMLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [showDestroyConfirm, setShowDestroyConfirm] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  // LLM config UI: "grid" = provider selection, "form" = entering API key, null = show configured state
  const [llmView, setLlmView] = useState<"grid" | "form" | null>(null);
  const [llmSelectedProvider, setLlmSelectedProvider] = useState<string | null>(null);
  const [llmApiKey, setLlmApiKey] = useState("");
  const [llmModel, setLlmModel] = useState("");
  const [llmConfiguring, setLlmConfiguring] = useState(false);

  // Validation state
  type ValidationResult = {
    overall: "pass" | "fail" | "warn";
    checks: { name: string; status: "pass" | "fail" | "warn"; message: string }[];
  };
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [agentValidating, setAgentValidating] = useState<string | null>(null); // agentId being validated
  const [agentValidationResults, setAgentValidationResults] = useState<
    Record<string, ValidationResult>
  >({});
  const [agentSetupRunning, setAgentSetupRunning] = useState<string | null>(null);
  const [cronDialogAgent, setCronDialogAgent] = useState<string | null>(null); // slug shown in cron dialog
  const [cronCheckLoading, setCronCheckLoading] = useState(false);
  const [cronExists, setCronExists] = useState<boolean | null>(null); // null = not checked yet
  const [cronExistingSchedule, setCronExistingSchedule] = useState<string | null>(null);

  // Daemon log streaming state
  const [showDaemonLogs, setShowDaemonLogs] = useState(false);
  const [daemonLines, setDaemonLines] = useState<string[]>([]);
  const [daemonConnected, setDaemonConnected] = useState(false);
  const [daemonFullscreen, setDaemonFullscreen] = useState(false);
  const daemonLogRef = useRef<HTMLDivElement>(null);
  const daemonFullscreenLogRef = useRef<HTMLDivElement>(null);

  // Container logs state
  interface ContainerInfo {
    id: string;
    name: string;
    image: string;
    status: string;
    state: string;
  }
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [containersLoading, setContainersLoading] = useState(false);
  const [selectedContainer, setSelectedContainer] = useState<string | null>(null);
  const [containerLogs, setContainerLogs] = useState<string>("");
  const [containerLogsLoading, setContainerLogsLoading] = useState(false);
  const [showContainerLogs, setShowContainerLogs] = useState(false);
  const containerLogRef = useRef<HTMLDivElement>(null);

  // Model selection state
  const [vmModelSwitching, setVmModelSwitching] = useState(false);
  const [vmModelDropdownOpen, setVmModelDropdownOpen] = useState(false);
  const [agentModelDropdownOpen, setAgentModelDropdownOpen] = useState<string | null>(null);
  const [agentModelSwitching, setAgentModelSwitching] = useState<string | null>(null);

  const isSetupState = vm ? SETUP_STATES.includes(vm.status) : false;

  // Close model dropdowns on outside click
  useEffect(() => {
    if (!vmModelDropdownOpen && !agentModelDropdownOpen) return;
    const handler = () => {
      setVmModelDropdownOpen(false);
      setAgentModelDropdownOpen(null);
    };
    // Delay to avoid closing immediately on the click that opened it
    const timer = setTimeout(() => document.addEventListener("click", handler), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", handler);
    };
  }, [vmModelDropdownOpen, agentModelDropdownOpen]);

  const fetchVM = useCallback(async () => {
    try {
      const res = await fetch(`/api/cloud-vms/${vmId}`);
      if (res.ok) {
        const data = await res.json();
        setVM(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [vmId]);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch(`/api/cloud-vms/${vmId}/logs?limit=50`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch {
      // ignore
    }
  }, [vmId]);

  const fetchContainers = useCallback(async () => {
    setContainersLoading(true);
    try {
      const res = await fetch(`/api/cloud-vms/${vmId}/containers`);
      if (res.ok) {
        const data = await res.json();
        setContainers(data.containers || []);
      }
    } catch {
      // ignore
    } finally {
      setContainersLoading(false);
    }
  }, [vmId]);

  const fetchContainerLogs = useCallback(
    async (containerId: string) => {
      setContainerLogsLoading(true);
      setContainerLogs("");
      try {
        const res = await fetch(`/api/cloud-vms/${vmId}/containers/${containerId}/logs?tail=500`);
        if (res.ok) {
          const data = await res.json();
          setContainerLogs(data.logs || "");
          setTimeout(() => {
            containerLogRef.current?.scrollTo({ top: containerLogRef.current.scrollHeight });
          }, 50);
        } else {
          const data = await res.json();
          setContainerLogs(`Error: ${data.error || "Failed to fetch logs"}`);
        }
      } catch {
        setContainerLogs("Error: Failed to fetch logs");
      } finally {
        setContainerLogsLoading(false);
      }
    },
    [vmId],
  );

  useEffect(() => {
    fetchVM();
  }, [fetchVM]);

  // Auto-fetch containers when VM is running and section is shown
  useEffect(() => {
    if (vm?.status === "running" && showContainerLogs) {
      fetchContainers();
    }
  }, [vm?.status, showContainerLogs, fetchContainers]);

  // Auto-show logs during setup states
  useEffect(() => {
    if (isSetupState) setShowLogs(true);
  }, [isSetupState]);

  useEffect(() => {
    if (showLogs) fetchLogs();
  }, [showLogs, fetchLogs]);

  // Poll while in transitional states
  useEffect(() => {
    if (!vm) return;
    const transitional = [...SETUP_STATES, "destroying"];
    if (!transitional.includes(vm.status)) return;
    const interval = setInterval(() => {
      fetchVM();
      if (showLogs) fetchLogs();
    }, 3000);
    return () => clearInterval(interval);
  }, [vm?.status, fetchVM, fetchLogs, showLogs]);

  // Daemon log streaming via SSE
  useEffect(() => {
    if (!showDaemonLogs || vm?.status !== "running") return;

    setDaemonLines([]);
    setDaemonConnected(false);

    const es = new EventSource(`/api/cloud-vms/${vmId}/logs/stream`);
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    es.addEventListener("connected", () => {
      setDaemonConnected(true);
    });

    es.addEventListener("log", (e) => {
      try {
        const { line } = JSON.parse(e.data);
        setDaemonLines((prev) => {
          const next = [...prev, line];
          return next.length > 1000 ? next.slice(-1000) : next;
        });
      } catch {
        // ignore parse errors
      }
    });

    es.addEventListener("error", () => {
      setDaemonConnected(false);
      es.close();
      reconnectTimer = setTimeout(() => {
        // trigger re-mount by toggling
        setShowDaemonLogs(false);
        setTimeout(() => setShowDaemonLogs(true), 50);
      }, 3000);
    });

    return () => {
      es.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      setDaemonConnected(false);
    };
  }, [showDaemonLogs, vmId, vm?.status]);

  // Auto-scroll daemon logs
  useEffect(() => {
    if (daemonLogRef.current) {
      daemonLogRef.current.scrollTop = daemonLogRef.current.scrollHeight;
    }
    if (daemonFullscreenLogRef.current) {
      daemonFullscreenLogRef.current.scrollTop = daemonFullscreenLogRef.current.scrollHeight;
    }
  }, [daemonLines]);

  // Close fullscreen on Escape
  useEffect(() => {
    if (!daemonFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDaemonFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [daemonFullscreen]);

  const runSystemValidation = useCallback(async () => {
    setValidating(true);
    setValidationResult(null);
    try {
      const res = await fetch(`/api/cloud-vms/${vmId}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: "system" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Validation failed");
        return;
      }
      setValidationResult(data);
    } catch {
      toast.error("Failed to run validation");
    } finally {
      setValidating(false);
    }
  }, [vmId]);

  const runAgentValidation = useCallback(
    async (targetAgentId: string) => {
      setAgentValidating(targetAgentId);
      setAgentValidationResults((prev) => {
        const next = { ...prev };
        delete next[targetAgentId];
        return next;
      });
      try {
        const res = await fetch(`/api/cloud-vms/${vmId}/validate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ level: "agent", agentId: targetAgentId }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error || "Validation failed");
          return;
        }
        setAgentValidationResults((prev) => ({ ...prev, [targetAgentId]: data }));
      } catch {
        toast.error("Failed to validate agent");
      } finally {
        setAgentValidating(null);
      }
    },
    [vmId],
  );

  const runAgentSetup = useCallback(
    async (slug: string, action: "cron" | "restart-gateway" | "all") => {
      setAgentSetupRunning(slug);
      try {
        const res = await fetch(`/api/cloud-vms/${vmId}/agents/${slug}/setup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error || "Setup failed");
          return;
        }
        const results = data.results as { action: string; ok: boolean; message: string }[];
        const failed = results.filter((r) => !r.ok);
        if (failed.length > 0) {
          toast.error(failed.map((r) => `${r.action}: ${r.message}`).join("\n"));
        } else {
          toast.success(results.map((r) => r.message).join(", "));
        }
      } catch {
        toast.error("Failed to run setup");
      } finally {
        setAgentSetupRunning(null);
      }
    },
    [vmId],
  );

  const openCronDialog = useCallback(
    async (slug: string) => {
      setCronDialogAgent(slug);
      setCronExists(null);
      setCronExistingSchedule(null);
      setCronCheckLoading(true);
      try {
        const res = await fetch(`/api/cloud-vms/${vmId}/agents/${slug}/setup`);
        const data = await res.json();
        if (res.ok) {
          setCronExists(data.cronExists);
          setCronExistingSchedule(data.schedule || null);
        }
      } catch {
        // couldn't check, allow creating anyway
        setCronExists(false);
      } finally {
        setCronCheckLoading(false);
      }
    },
    [vmId],
  );

  const handleAction = async (action: "stop" | "start" | "destroy" | "retry" | "repair") => {
    setActionLoading(action);
    try {
      let res: Response;
      if (action === "destroy") {
        res = await fetch(`/api/cloud-vms/${vmId}`, { method: "DELETE" });
      } else if (action === "retry") {
        res = await fetch(`/api/cloud-vms/${vmId}/retry`, { method: "POST" });
      } else if (action === "repair") {
        res = await fetch(`/api/cloud-vms/${vmId}/repair`, { method: "POST" });
      } else {
        res = await fetch(`/api/cloud-vms/${vmId}/${action}`, { method: "POST" });
      }

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || `Failed to ${action} VM`);
        return;
      }

      const messages: Record<string, string> = {
        stop: "Server powered off",
        start: "Server powered on",
        destroy: "Server destroyed",
        retry: "Retrying provisioning...",
        repair: "OpenClaw service repaired and restarted",
      };
      toast.success(messages[action]);
      setShowDestroyConfirm(false);
      if (action === "destroy") {
        router.push("/cloud");
        return;
      }
      await fetchVM();
    } catch {
      toast.error(`Failed to ${action} VM`);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!vm) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        VM not found
      </div>
    );
  }

  const badgeInfo = STATUS_BADGE_VARIANT[vm.status] || STATUS_BADGE_VARIANT.error;
  const progress = vm.setupProgress ?? 0;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 max-w-3xl mx-auto w-full space-y-6">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Cloud", href: "/cloud" },
          { label: vm?.name || "VM" },
        ]}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
            <Server className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            {editingName ? (
              <form
                className="flex items-center gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    const res = await fetch(`/api/cloud-vms/${vm.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ name: nameInput }),
                    });
                    if (!res.ok) throw new Error("Failed");
                    const updated = await res.json();
                    setVM(updated);
                    setEditingName(false);
                    toast.success("VM name updated");
                  } catch {
                    toast.error("Failed to update name");
                  }
                }}
              >
                <input
                  autoFocus
                  className="text-xl font-bold text-foreground border border-border rounded-lg px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setEditingName(false);
                  }}
                />
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon-xs"
                  className="text-success hover:text-success"
                  title="Save"
                  aria-label="Save"
                >
                  <Check className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setEditingName(false)}
                  className="text-muted-foreground hover:text-foreground"
                  title="Cancel"
                  aria-label="Cancel"
                >
                  <X className="w-4 h-4" />
                </Button>
              </form>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-foreground">
                  {vm.name || vm.serverName || vm.id.slice(0, 8)}
                </h1>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => {
                    setNameInput(vm.name || vm.serverName || "");
                    setEditingName(true);
                  }}
                  className="text-muted-foreground hover:text-foreground"
                  title="Rename VM"
                  aria-label="Rename VM"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Badge variant={badgeInfo.variant}>{badgeInfo.label}</Badge>
              {vm.llmConfigured && vm.llmProvider && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium text-muted-foreground bg-muted rounded-full">
                  <span
                    className={`w-2 h-2 rounded-full ${PROVIDER_COLORS[vm.llmProvider]?.dot || "bg-gray-400"}`}
                  />
                  {LLM_PROVIDERS_MAP[vm.llmProvider]?.name || vm.llmProvider} / {vm.llmModel}
                </span>
              )}
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={fetchVM}
          className="text-muted-foreground hover:text-foreground"
          title="Refresh"
          aria-label="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Setup Progress */}
      {(isSetupState || (vm.status === "running" && progress === 100)) && (
        <Card padding="md" className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-foreground font-medium">
              {vm.setupStep ? STEP_LABELS[vm.setupStep] || vm.setupStep : "Setting up..."}
            </span>
            <span className="text-muted-foreground tabular-nums">{progress}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-purple-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </Card>
      )}

      {/* Error message */}
      {vm.status === "error" && vm.errorMessage && (
        <div className="flex items-start gap-2 px-4 py-3 bg-destructive-muted border border-destructive/30 rounded-lg">
          <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{vm.errorMessage}</p>
        </div>
      )}

      {/* Info grid */}
      <Card padding="md">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          {vm.ipv4 && (
            <div>
              <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                <Globe className="w-3.5 h-3.5" />
                <span className="text-xs">IP Address</span>
              </div>
              <span className="font-mono text-foreground">{vm.ipv4}</span>
            </div>
          )}
          <div>
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
              <Cpu className="w-3.5 h-3.5" />
              <span className="text-xs">Server</span>
            </div>
            <span className="text-foreground">
              {vm.serverType} / {vm.region}
            </span>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
              <Clock className="w-3.5 h-3.5" />
              <span className="text-xs">Uptime</span>
            </div>
            <span className="text-foreground">{formatUptime(vm.totalUptimeSeconds)}</span>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Est. Cost</div>
            <span className="text-foreground">{formatCost(vm.estimatedCostCents)}</span>
          </div>
        </div>
      </Card>

      {/* Live Gateway status */}
      {vm.status === "running" && vm.connectionStatus && (
        <LiveGatewayStatus
          vmId={vm.id}
          initialStatus={vm.connectionStatus}
          connectedAt={vm.connectedAt ?? null}
          lastDisconnectedAt={vm.lastDisconnectedAt ?? null}
          pluginVersion={vm.pluginVersion ?? null}
        />
      )}

      {/* VM Actions */}
      <div className="flex items-center gap-2">
        {vm.status === "running" && (
          <>
            <Button
              size="sm"
              variant="warning"
              icon={<PowerOff />}
              loading={actionLoading === "stop"}
              disabled={actionLoading !== null}
              onClick={() => handleAction("stop")}
            >
              Stop
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={<Wrench />}
              loading={actionLoading === "repair"}
              disabled={actionLoading !== null}
              onClick={() => handleAction("repair")}
              className="text-violet-700 bg-violet-100 hover:bg-violet-200 border-violet-200"
              title="Repair OpenClaw service file and restart"
            >
              Repair Service
            </Button>
          </>
        )}
        {vm.status === "stopped" && (
          <Button
            size="sm"
            variant="success"
            icon={<Power />}
            loading={actionLoading === "start"}
            disabled={actionLoading !== null}
            onClick={() => handleAction("start")}
          >
            Start
          </Button>
        )}

        {/* Retry button for error state */}
        {vm.status === "error" && (
          <Button
            size="sm"
            variant="primary"
            icon={<RotateCcw />}
            loading={actionLoading === "retry"}
            disabled={actionLoading !== null}
            onClick={() => handleAction("retry")}
          >
            Retry
          </Button>
        )}

        <Button
          size="sm"
          variant="secondary"
          icon={<Trash2 />}
          disabled={actionLoading !== null || ["destroying", "destroyed"].includes(vm.status)}
          onClick={() => setShowDestroyConfirm(true)}
          className="text-destructive bg-destructive/15 hover:bg-destructive/25 border-destructive/30"
        >
          Destroy
        </Button>
        <ConfirmDialog
          isOpen={showDestroyConfirm}
          onClose={() => setShowDestroyConfirm(false)}
          onConfirm={async () => {
            setShowDestroyConfirm(false);
            handleAction("destroy");
          }}
          title="Destroy this VM?"
          description="This will destroy the VM and unassign all agents."
          confirmLabel="Destroy"
          variant="danger"
          loading={actionLoading === "destroy"}
        />

        <button
          onClick={() => setShowLogs(!showLogs)}
          className="ml-auto text-xs text-muted-foreground hover:text-foreground transition"
        >
          {showLogs ? "Hide logs" : "Show logs"}
        </button>
      </div>

      {/* Logs */}
      {showLogs && (
        <div className="bg-foreground rounded-lg p-3 max-h-48 overflow-y-auto">
          {logs.length === 0 ? (
            <p className="text-xs text-muted-foreground">No logs yet</p>
          ) : (
            <div className="space-y-1">
              {logs.map((log) => (
                <div key={log.id} className="flex items-start gap-2 text-xs font-mono">
                  <span className="text-muted-foreground flex-shrink-0">
                    {new Date(log.createdAt).toLocaleTimeString()}
                  </span>
                  <span
                    className={
                      log.level === "error"
                        ? "text-red-400"
                        : log.level === "warn"
                          ? "text-yellow-400"
                          : "text-gray-300"
                    }
                  >
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Live Daemon Logs — only when running */}
      {vm.status === "running" && (
        <Card padding="md">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Live Daemon Logs</h2>
              {showDaemonLogs && (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      daemonConnected ? "bg-success animate-pulse" : "bg-warning"
                    }`}
                  />
                  {daemonConnected ? "Streaming" : "Connecting..."}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {showDaemonLogs && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setDaemonFullscreen(true)}
                  className="text-muted-foreground hover:text-foreground"
                  title="Fullscreen"
                  aria-label="Fullscreen"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </Button>
              )}
              <button
                onClick={() => setShowDaemonLogs(!showDaemonLogs)}
                className="text-xs text-muted-foreground hover:text-foreground transition"
              >
                {showDaemonLogs ? "Disconnect" : "Stream logs"}
              </button>
            </div>
          </div>

          {showDaemonLogs && (
            <div
              ref={daemonLogRef}
              className="bg-foreground rounded-lg p-3 max-h-80 overflow-y-auto"
            >
              {daemonLines.length === 0 ? (
                <p className="text-xs text-muted-foreground">Waiting for logs...</p>
              ) : (
                <div className="space-y-0.5">
                  {daemonLines.map((line, i) => (
                    <div
                      key={i}
                      className="text-xs font-mono text-gray-300 whitespace-pre-wrap break-all"
                    >
                      {line}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Fullscreen daemon logs overlay */}
      {daemonFullscreen && showDaemonLogs && (
        <div className="fixed inset-x-0 bottom-0 top-titlebar z-50 bg-foreground flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-gray-200">Live Daemon Logs</h2>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className={`w-2 h-2 rounded-full ${
                    daemonConnected ? "bg-success animate-pulse" : "bg-warning"
                  }`}
                />
                {daemonConnected ? "Streaming" : "Connecting..."}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setDaemonFullscreen(false)}
                className="text-muted-foreground hover:text-gray-200"
                title="Exit fullscreen (Esc)"
                aria-label="Exit fullscreen"
              >
                <Minimize2 className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  setDaemonFullscreen(false);
                  setShowDaemonLogs(false);
                }}
                className="text-muted-foreground hover:text-gray-200"
                title="Disconnect"
                aria-label="Disconnect"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div ref={daemonFullscreenLogRef} className="flex-1 overflow-y-auto p-4">
            {daemonLines.length === 0 ? (
              <p className="text-xs text-muted-foreground">Waiting for logs...</p>
            ) : (
              <div className="space-y-0.5">
                {daemonLines.map((line, i) => (
                  <div
                    key={i}
                    className="text-xs font-mono text-gray-300 whitespace-pre-wrap break-all"
                  >
                    {line}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Container Logs — only when running */}
      {vm.status === "running" && (
        <Card padding="md">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Box className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Container Logs</h2>
            </div>
            <button
              onClick={() => setShowContainerLogs(!showContainerLogs)}
              className="text-xs text-muted-foreground hover:text-foreground transition"
            >
              {showContainerLogs ? "Hide" : "Browse containers"}
            </button>
          </div>

          {showContainerLogs && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <select
                  value={selectedContainer || ""}
                  onChange={(e) => setSelectedContainer(e.target.value || null)}
                  className="flex-1 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-background"
                >
                  <option value="">Select a container...</option>
                  {containers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.image}) — {c.state}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<RefreshCw />}
                  loading={containersLoading}
                  onClick={fetchContainers}
                  title="Refresh container list"
                >
                  Refresh
                </Button>
              </div>

              {containers.length === 0 && !containersLoading && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  No containers found on this VM.
                </p>
              )}

              {selectedContainer && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      icon={<Terminal />}
                      loading={containerLogsLoading}
                      onClick={() => fetchContainerLogs(selectedContainer)}
                    >
                      {containerLogsLoading ? "Fetching..." : "View Logs"}
                    </Button>
                  </div>

                  {(containerLogs || containerLogsLoading) && (
                    <div
                      ref={containerLogRef}
                      className="bg-foreground rounded-lg p-3 max-h-80 overflow-y-auto"
                    >
                      {containerLogsLoading && !containerLogs ? (
                        <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="text-xs">Fetching container logs...</span>
                        </div>
                      ) : (
                        <pre className="text-xs font-mono text-gray-300 whitespace-pre-wrap break-all">
                          {containerLogs}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* LLM Configuration — only show when running */}
      {vm.status === "running" &&
        (() => {
          const showGrid = llmView === "grid" || (!vm.llmConfigured && llmView !== "form");
          const showForm = llmView === "form" && llmSelectedProvider;
          const showConfigured = vm.llmConfigured && llmView === null;

          return (
            <Card padding="md">
              {/* State C: Configured */}
              {showConfigured &&
                (() => {
                  const currentProvider = vm.llmProvider ? LLM_PROVIDERS_MAP[vm.llmProvider] : null;
                  const providerModels = currentProvider?.models || [];
                  const currentModelDisplay =
                    vm.llmModel?.replace(`${vm.llmProvider}/`, "") || vm.llmModel;

                  return (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-success/15 flex items-center justify-center">
                        <Check className="w-4 h-4 text-success" />
                      </div>
                      <div>
                        <h2 className="text-sm font-semibold text-foreground">LLM Configured</h2>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">
                            {currentProvider?.name || vm.llmProvider} —
                          </span>
                          {/* Model quick-switch dropdown */}
                          <div className="relative">
                            <button
                              onClick={() => setVmModelDropdownOpen(!vmModelDropdownOpen)}
                              disabled={vmModelSwitching}
                              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 transition disabled:opacity-50"
                            >
                              {vmModelSwitching ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : null}
                              {currentModelDisplay}
                              <ChevronDown className="w-3 h-3" />
                            </button>
                            {vmModelDropdownOpen && providerModels.length > 0 && (
                              <div className="absolute top-full left-0 mt-1 z-50 bg-background border border-border rounded-lg shadow-lg py-1 min-w-[220px]">
                                {providerModels.map((m) => {
                                  const qualifiedModel =
                                    vm.llmProvider && !m.includes("/")
                                      ? `${vm.llmProvider}/${m}`
                                      : m;
                                  const isActive =
                                    vm.llmModel === m || vm.llmModel === qualifiedModel;
                                  return (
                                    <button
                                      key={m}
                                      onClick={async () => {
                                        setVmModelDropdownOpen(false);
                                        if (isActive) return;
                                        setVmModelSwitching(true);
                                        try {
                                          const res = await fetch(
                                            `/api/cloud-vms/${vmId}/llm-model`,
                                            {
                                              method: "POST",
                                              headers: { "Content-Type": "application/json" },
                                              body: JSON.stringify({ model: qualifiedModel }),
                                            },
                                          );
                                          if (!res.ok) {
                                            const data = await res.json();
                                            toast.error(data.error || "Failed to switch model");
                                            return;
                                          }
                                          toast.success(`Default model switched to ${m}`);
                                          await fetchVM();
                                        } catch {
                                          toast.error("Failed to switch model");
                                        } finally {
                                          setVmModelSwitching(false);
                                        }
                                      }}
                                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition ${
                                        isActive
                                          ? "font-semibold text-blue-600 bg-blue-50"
                                          : "text-foreground"
                                      }`}
                                    >
                                      {m}
                                      {isActive && (
                                        <span className="ml-1.5 text-blue-400">(current)</span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setLlmView("grid");
                          setLlmSelectedProvider(null);
                          setLlmApiKey("");
                          setLlmModel("");
                        }}
                        className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                      >
                        Reconfigure
                      </Button>
                    </div>
                  );
                })()}

              {/* State A: Provider grid */}
              {showGrid && (
                <>
                  <h2 className="text-sm font-semibold text-foreground mb-3">LLM Configuration</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
                    {LLM_PROVIDERS.map((p) => {
                      const colors = PROVIDER_COLORS[p.id];
                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            setLlmSelectedProvider(p.id);
                            setLlmModel(p.defaultModel);
                            setLlmApiKey("");
                            setLlmView("form");
                          }}
                          className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border hover:border-border hover:bg-muted transition"
                        >
                          <div
                            className={`w-8 h-8 rounded-lg ${colors?.bg || "bg-muted"} flex items-center justify-center`}
                          >
                            <span
                              className={`text-sm font-bold ${colors?.text || "text-muted-foreground"}`}
                            >
                              {p.name[0]}
                            </span>
                          </div>
                          <span className="text-xs font-medium text-foreground">{p.name}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Shield className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <p>
                      Your API key is sent directly to the VM via SSH and is not stored on our
                      servers. We cannot retrieve it for you after configuration.
                    </p>
                  </div>
                </>
              )}

              {/* State B: Config form */}
              {showForm &&
                (() => {
                  const provider = LLM_PROVIDERS_MAP[llmSelectedProvider!];
                  if (!provider) return null;
                  const colors = PROVIDER_COLORS[llmSelectedProvider!];
                  const activeModels = provider.models || [];

                  return (
                    <>
                      <div className="flex items-center gap-2 mb-4">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setLlmView("grid")}
                          className="text-muted-foreground hover:text-foreground"
                          aria-label="Back to providers"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <div
                          className={`w-6 h-6 rounded-md ${colors?.bg || "bg-muted"} flex items-center justify-center`}
                        >
                          <span
                            className={`text-xs font-bold ${colors?.text || "text-muted-foreground"}`}
                          >
                            {provider.name[0]}
                          </span>
                        </div>
                        <h2 className="text-sm font-semibold text-foreground">{provider.name}</h2>
                      </div>

                      <div className="space-y-3">
                        <Input
                          label="API Key"
                          type="password"
                          value={llmApiKey}
                          onChange={(e) => setLlmApiKey(e.target.value)}
                          placeholder={`${provider.envVar}=sk-...`}
                        />

                        {/* Model selector */}
                        <div>
                          <label className="block text-xs font-medium text-foreground mb-1">
                            Model
                          </label>
                          {activeModels.length > 0 ? (
                            <select
                              value={activeModels.includes(llmModel) ? llmModel : "__custom__"}
                              onChange={(e) => {
                                if (e.target.value === "__custom__") {
                                  setLlmModel("");
                                } else {
                                  setLlmModel(e.target.value);
                                }
                              }}
                              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-background"
                            >
                              {activeModels.map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                              <option value="__custom__">Custom model...</option>
                            </select>
                          ) : (
                            <Input
                              type="text"
                              value={llmModel}
                              onChange={(e) => setLlmModel(e.target.value)}
                              placeholder={provider.defaultModel}
                            />
                          )}
                          {activeModels.length > 0 && !activeModels.includes(llmModel) && (
                            <Input
                              type="text"
                              value={llmModel}
                              onChange={(e) => setLlmModel(e.target.value)}
                              placeholder="Enter custom model ID..."
                              className="mt-2"
                            />
                          )}
                        </div>

                        <div className="flex items-start gap-2 text-xs text-muted-foreground">
                          <Shield className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                          <p>
                            Your API key is sent directly to the VM via SSH and is not stored on our
                            servers. We cannot retrieve it for you after configuration.
                          </p>
                        </div>

                        <Button
                          icon={<Check />}
                          loading={llmConfiguring}
                          disabled={llmConfiguring || !llmModel || !llmApiKey}
                          className="w-full"
                          onClick={async () => {
                            if (!llmApiKey || !llmModel) {
                              toast.error("API key and model are required");
                              return;
                            }
                            setLlmConfiguring(true);
                            try {
                              const res = await fetch(`/api/cloud-vms/${vmId}/llm-config`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  providerId: llmSelectedProvider,
                                  apiKey: llmApiKey,
                                  model: llmModel,
                                }),
                              });
                              if (!res.ok) {
                                const data = await res.json();
                                toast.error(data.error || "Failed to configure LLM");
                                return;
                              }
                              setLlmApiKey("");
                              setLlmSelectedProvider(null);
                              setLlmView(null);
                              toast.success("LLM configured successfully");
                              await fetchVM();
                            } catch {
                              toast.error("Failed to configure LLM");
                            } finally {
                              setLlmConfiguring(false);
                            }
                          }}
                        >
                          {llmConfiguring ? "Configuring..." : "Configure"}
                        </Button>
                      </div>
                    </>
                  );
                })()}
            </Card>
          );
        })()}

      {/* Validate Config */}
      {vm.status === "running" && (
        <Card padding="md">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Validate Configuration</h2>
            </div>
            <Button size="sm" icon={<Check />} loading={validating} onClick={runSystemValidation}>
              {validating ? "Validating..." : "Validate Config"}
            </Button>
          </div>

          {validating && (
            <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Running checks — this may take up to a minute...</span>
            </div>
          )}

          {validationResult && !validating && (
            <div className="space-y-2">
              {/* Overall status */}
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                  validationResult.overall === "pass"
                    ? "bg-success-muted text-success"
                    : validationResult.overall === "warn"
                      ? "bg-warning-muted text-warning"
                      : "bg-destructive-muted text-destructive"
                }`}
              >
                {validationResult.overall === "pass" ? (
                  <Check className="w-4 h-4" />
                ) : validationResult.overall === "warn" ? (
                  <AlertCircle className="w-4 h-4" />
                ) : (
                  <X className="w-4 h-4" />
                )}
                {validationResult.overall === "pass"
                  ? "All checks passed"
                  : validationResult.overall === "warn"
                    ? "Some warnings detected"
                    : "Issues found — check details below"}
              </div>

              {/* Individual checks */}
              <div className="border border-border rounded-lg divide-y divide-border">
                {validationResult.checks.map((check, i) => (
                  <div key={i} className="flex items-start gap-3 px-3 py-2.5">
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        check.status === "pass"
                          ? "bg-success/15"
                          : check.status === "warn"
                            ? "bg-warning/15"
                            : "bg-destructive/15"
                      }`}
                    >
                      {check.status === "pass" ? (
                        <Check className="w-3 h-3 text-success" />
                      ) : check.status === "warn" ? (
                        <AlertCircle className="w-3 h-3 text-warning" />
                      ) : (
                        <X className="w-3 h-3 text-destructive" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{check.name}</p>
                      <p
                        className={`text-xs mt-0.5 ${
                          check.status === "pass"
                            ? "text-muted-foreground"
                            : check.status === "warn"
                              ? "text-warning"
                              : "text-destructive"
                        }`}
                      >
                        {check.message}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!validationResult && !validating && (
            <p className="text-xs text-muted-foreground text-center py-4">
              Checks OpenClaw service, config, gateway, hooks, LLM keys, agents list, and disk space
            </p>
          )}
        </Card>
      )}

      {/* Assigned Agents */}
      <Card padding="md">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">
            Assigned Agents ({vm.agents.length})
          </h2>
        </div>

        {vm.agents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No agents assigned to this VM.
            {vm.status === "running" && ' Click "Assign Agent" to add one.'}
          </p>
        ) : (
          <div className="space-y-3">
            {vm.agents.map((agent) => {
              const slug = agent.username || agent.name.toLowerCase().replace(/\s+/g, "-");
              const agentResult = agentValidationResults[slug];
              const isValidatingThis = agentValidating === slug;
              const isSettingUp = agentSetupRunning === slug;

              return (
                <div key={agent.id} className="border border-border rounded-lg">
                  <div className="flex items-center gap-2.5 py-2.5 px-3">
                    <Link
                      href={`/agents?id=${agent.id}`}
                      className="flex items-center gap-2.5 flex-1 hover:opacity-80 transition"
                    >
                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-sm">
                        {agent.identityEmoji || agent.name[0]}
                      </div>
                      <div>
                        <span className="text-sm font-medium text-foreground">{agent.name}</span>
                        {agent.username && (
                          <span className="text-xs text-muted-foreground ml-1.5">
                            @{agent.username}
                          </span>
                        )}
                      </div>
                    </Link>

                    <div className="flex items-center gap-2">
                      {/* Per-agent model selector */}
                      {vm.status === "running" &&
                        vm.llmConfigured &&
                        (() => {
                          const currentProvider = vm.llmProvider
                            ? LLM_PROVIDERS_MAP[vm.llmProvider]
                            : null;
                          const providerModels = currentProvider?.models || [];
                          const agentModel = agent.llmModel;
                          const displayModel = agentModel
                            ? agentModel.replace(`${vm.llmProvider}/`, "")
                            : "VM default";
                          const isDropdownOpen = agentModelDropdownOpen === slug;
                          const isSwitching = agentModelSwitching === slug;

                          return providerModels.length > 0 ? (
                            <div className="relative">
                              <button
                                onClick={() =>
                                  setAgentModelDropdownOpen(isDropdownOpen ? null : slug)
                                }
                                disabled={isSwitching}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition disabled:opacity-50 ${
                                  agentModel
                                    ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
                                    : "bg-muted text-muted-foreground hover:bg-muted"
                                }`}
                              >
                                {isSwitching ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                                {displayModel}
                                <ChevronDown className="w-3 h-3" />
                              </button>
                              {isDropdownOpen && (
                                <div className="absolute top-full right-0 mt-1 z-50 bg-background border border-border rounded-lg shadow-lg py-1 min-w-[220px]">
                                  <button
                                    onClick={async () => {
                                      setAgentModelDropdownOpen(null);
                                      if (!agentModel) return;
                                      setAgentModelSwitching(slug);
                                      try {
                                        const res = await fetch(
                                          `/api/cloud-vms/${vmId}/agents/${slug}/model`,
                                          {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ model: null }),
                                          },
                                        );
                                        if (!res.ok) {
                                          const data = await res.json();
                                          toast.error(data.error || "Failed to reset model");
                                          return;
                                        }
                                        toast.success(`${agent.name} reset to VM default model`);
                                        await fetchVM();
                                      } catch {
                                        toast.error("Failed to reset model");
                                      } finally {
                                        setAgentModelSwitching(null);
                                      }
                                    }}
                                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition ${
                                      !agentModel
                                        ? "font-semibold text-blue-600 bg-blue-50"
                                        : "text-foreground"
                                    }`}
                                  >
                                    Use VM default
                                    {!agentModel && (
                                      <span className="ml-1.5 text-blue-400">(current)</span>
                                    )}
                                  </button>
                                  <div className="border-t border-border my-1" />
                                  {providerModels.map((m) => {
                                    const qualifiedModel =
                                      vm.llmProvider && !m.includes("/")
                                        ? `${vm.llmProvider}/${m}`
                                        : m;
                                    const isActive =
                                      agentModel === m || agentModel === qualifiedModel;
                                    return (
                                      <button
                                        key={m}
                                        onClick={async () => {
                                          setAgentModelDropdownOpen(null);
                                          if (isActive) return;
                                          setAgentModelSwitching(slug);
                                          try {
                                            const res = await fetch(
                                              `/api/cloud-vms/${vmId}/agents/${slug}/model`,
                                              {
                                                method: "POST",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({ model: qualifiedModel }),
                                              },
                                            );
                                            if (!res.ok) {
                                              const data = await res.json();
                                              toast.error(data.error || "Failed to set model");
                                              return;
                                            }
                                            toast.success(`${agent.name} model set to ${m}`);
                                            await fetchVM();
                                          } catch {
                                            toast.error("Failed to set model");
                                          } finally {
                                            setAgentModelSwitching(null);
                                          }
                                        }}
                                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition ${
                                          isActive
                                            ? "font-semibold text-blue-600 bg-blue-50"
                                            : "text-foreground"
                                        }`}
                                      >
                                        {m}
                                        {isActive && (
                                          <span className="ml-1.5 text-blue-400">(current)</span>
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          ) : null;
                        })()}

                      {/* Status badge from previous validation */}
                      {agentResult && !isValidatingThis && (
                        <Badge
                          variant={
                            agentResult.overall === "pass"
                              ? "green"
                              : agentResult.overall === "warn"
                                ? "yellow"
                                : "red"
                          }
                        >
                          {agentResult.overall === "pass" ? (
                            <Check className="w-3 h-3" />
                          ) : agentResult.overall === "warn" ? (
                            <AlertCircle className="w-3 h-3" />
                          ) : (
                            <X className="w-3 h-3" />
                          )}
                          {agentResult.overall === "pass"
                            ? "OK"
                            : agentResult.overall === "warn"
                              ? "Warn"
                              : "Fail"}
                        </Badge>
                      )}

                      {vm.status === "running" && (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={<Shield />}
                            loading={isValidatingThis}
                            disabled={isValidatingThis || isSettingUp}
                            onClick={() => runAgentValidation(slug)}
                            title="Validate agent config, files, cron, and LLM"
                          >
                            {isValidatingThis ? "Checking..." : "Validate"}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={<Clock />}
                            loading={isSettingUp}
                            disabled={isSettingUp || isValidatingThis}
                            onClick={() => openCronDialog(slug)}
                            title="Setup heartbeat cron job"
                          >
                            Cron
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Agent validation results (expanded inline) */}
                  {isValidatingThis && (
                    <div className="px-3 pb-3">
                      <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-xs">
                          Running agent checks — this may take up to a minute...
                        </span>
                      </div>
                    </div>
                  )}

                  {agentResult && !isValidatingThis && (
                    <div className="px-3 pb-3 border-t border-border">
                      <div className="mt-2 space-y-1.5">
                        {agentResult.checks.map((check, i) => (
                          <div key={i} className="flex items-start gap-2 py-1">
                            <div
                              className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                                check.status === "pass"
                                  ? "bg-success/15"
                                  : check.status === "warn"
                                    ? "bg-warning/15"
                                    : "bg-destructive/15"
                              }`}
                            >
                              {check.status === "pass" ? (
                                <Check className="w-2.5 h-2.5 text-success" />
                              ) : check.status === "warn" ? (
                                <AlertCircle className="w-2.5 h-2.5 text-warning" />
                              ) : (
                                <X className="w-2.5 h-2.5 text-destructive" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-xs font-medium text-foreground">
                                {check.name}
                              </span>
                              <span
                                className={`text-xs ml-1.5 ${
                                  check.status === "pass"
                                    ? "text-muted-foreground"
                                    : check.status === "warn"
                                      ? "text-warning"
                                      : "text-destructive"
                                }`}
                              >
                                — {check.message}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Cron Setup Dialog */}
      {cronDialogAgent && (
        <div className="fixed inset-x-0 bottom-0 top-titlebar z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-md mx-4 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Heartbeat Cron — @{cronDialogAgent}
              </h3>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setCronDialogAgent(null)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {cronCheckLoading && (
              <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Checking existing cron...</span>
              </div>
            )}

            {!cronCheckLoading && cronExists && (
              <div className="space-y-4">
                <div className="border border-success/30 bg-success-muted rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-success">Cron Already Exists</p>
                      <p className="text-xs text-success mt-1">
                        Schedule:{" "}
                        <code className="bg-success/15 px-1 rounded">
                          {cronExistingSchedule || "unknown"}
                        </code>
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => setCronDialogAgent(null)}
                  >
                    Close
                  </Button>
                  <Button
                    variant="warning"
                    className="flex-1"
                    loading={agentSetupRunning === cronDialogAgent}
                    disabled={agentSetupRunning === cronDialogAgent}
                    onClick={async () => {
                      await runAgentSetup(cronDialogAgent, "cron");
                      setCronDialogAgent(null);
                    }}
                  >
                    {agentSetupRunning === cronDialogAgent ? "Recreating..." : "Recreate Cron"}
                  </Button>
                </div>
              </div>
            )}

            {!cronCheckLoading && !cronExists && (
              <div className="space-y-4">
                <div className="border border-warning/30 bg-warning-muted rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-warning">No Cron Found</p>
                      <p className="text-xs text-warning mt-1">
                        This agent has no heartbeat cron. Without it, the agent won&apos;t wake up
                        automatically to check for tasks.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => setCronDialogAgent(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1"
                    loading={agentSetupRunning === cronDialogAgent}
                    disabled={agentSetupRunning === cronDialogAgent}
                    onClick={async () => {
                      await runAgentSetup(cronDialogAgent, "cron");
                      setCronDialogAgent(null);
                    }}
                  >
                    {agentSetupRunning === cronDialogAgent ? "Creating..." : "Create Cron"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
