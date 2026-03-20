"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Copy,
  Check,
  Download,
  Loader2,
  Terminal,
  KeyRound,
  AlertTriangle,
  ShieldAlert,
  Archive,
  Send,
  Wrench,
  MessageSquare,
  Cloud,
  Server,
} from "lucide-react";
import { Button, Badge, Card } from "@/components/ui";
import { useFeatureFlag } from "@/components/context/FeatureFlagContext";
import { FLAG_KEYS } from "@agentcenter/utils";

interface ConfigFile {
  filename: string;
  content: string;
}

interface CloudVMAgent {
  id: string;
  name: string;
  identityEmoji?: string | null;
  username?: string | null;
  role?: string | null;
}

interface CloudVMOption {
  id: string;
  name: string;
  region: string;
  serverType: string;
  ipv4: string | null;
  agents: CloudVMAgent[];
}

interface SetupData {
  agent: {
    id: string;
    name: string;
    role: string;
    setupStatus: string;
    apiKeyPrefix: string | null;
    hostingType: string;
    cloudVmId: string | null;
  };
  configFiles: ConfigFile[];
  bootstrapMessage: string;
  cronSchedule: string;
  cronCommand: string;
  workspacePath: string;
  openclawAgentConfig: { id: string; name: string; workspace: string };
  mcUrl: string;
  cloudVms: CloudVMOption[];
}

type SetupMode = "cloud" | "auto" | "manual";

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      size="xs"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success(label ? `${label} copied` : "Copied");
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function DownloadButton({ filename, content }: { filename: string; content: string }) {
  return (
    <Button
      variant="secondary"
      size="xs"
      onClick={() => {
        const blob = new Blob([content], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }}
    >
      <Download className="w-3 h-3" />
      Download
    </Button>
  );
}

function createZipBlob(files: { name: string; content: string }[]): Blob {
  const encoder = new TextEncoder();
  const entries = files.map((f) => ({
    name: encoder.encode(f.name),
    data: encoder.encode(f.content),
  }));

  let localHeadersSize = 0;
  let centralDirSize = 0;
  for (const e of entries) {
    localHeadersSize += 30 + e.name.length + e.data.length;
    centralDirSize += 46 + e.name.length;
  }
  const totalSize = localHeadersSize + centralDirSize + 22;
  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  let localOffset = 0;
  const offsets: number[] = [];

  for (const e of entries) {
    offsets.push(localOffset);
    view.setUint32(localOffset, 0x04034b50, true);
    view.setUint16(localOffset + 4, 20, true);
    view.setUint16(localOffset + 6, 0, true);
    view.setUint16(localOffset + 8, 0, true);
    view.setUint16(localOffset + 10, 0, true);
    view.setUint16(localOffset + 12, 0, true);
    view.setUint32(localOffset + 14, crc32(e.data), true);
    view.setUint32(localOffset + 18, e.data.length, true);
    view.setUint32(localOffset + 22, e.data.length, true);
    view.setUint16(localOffset + 26, e.name.length, true);
    view.setUint16(localOffset + 28, 0, true);
    bytes.set(e.name, localOffset + 30);
    bytes.set(e.data, localOffset + 30 + e.name.length);
    localOffset += 30 + e.name.length + e.data.length;
  }

  const centralStart = localOffset;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    view.setUint32(localOffset, 0x02014b50, true);
    view.setUint16(localOffset + 4, 20, true);
    view.setUint16(localOffset + 6, 20, true);
    view.setUint16(localOffset + 8, 0, true);
    view.setUint16(localOffset + 10, 0, true);
    view.setUint16(localOffset + 12, 0, true);
    view.setUint16(localOffset + 14, 0, true);
    view.setUint32(localOffset + 16, crc32(e.data), true);
    view.setUint32(localOffset + 20, e.data.length, true);
    view.setUint32(localOffset + 24, e.data.length, true);
    view.setUint16(localOffset + 28, e.name.length, true);
    view.setUint16(localOffset + 30, 0, true);
    view.setUint16(localOffset + 32, 0, true);
    view.setUint16(localOffset + 34, 0, true);
    view.setUint16(localOffset + 36, 0, true);
    view.setUint32(localOffset + 38, 0, true);
    view.setUint32(localOffset + 42, offsets[i], true);
    bytes.set(e.name, localOffset + 46);
    localOffset += 46 + e.name.length;
  }

  view.setUint32(localOffset, 0x06054b50, true);
  view.setUint16(localOffset + 4, 0, true);
  view.setUint16(localOffset + 6, 0, true);
  view.setUint16(localOffset + 8, entries.length, true);
  view.setUint16(localOffset + 10, entries.length, true);
  view.setUint32(localOffset + 12, localOffset - centralStart, true);
  view.setUint32(localOffset + 16, centralStart, true);
  view.setUint16(localOffset + 20, 0, true);

  return new Blob([buf], { type: "application/zip" });
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function DownloadZipButton({ files, zipName }: { files: ConfigFile[]; zipName: string }) {
  return (
    <Button
      onClick={() => {
        const blob = createZipBlob(files.map((f) => ({ name: f.filename, content: f.content })));
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = zipName;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("ZIP downloaded");
      }}
    >
      <Archive className="w-4 h-4" />
      Download All as ZIP
    </Button>
  );
}

export function AgentSetupPage({ agentId }: { agentId: string }) {
  const router = useRouter();
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [setupMode, setSetupMode] = useState<SetupMode>("auto");
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [selectedVmId, setSelectedVmId] = useState<string>("");
  const [deploying, setDeploying] = useState(false);
  const [showDeployConfirm, setShowDeployConfirm] = useState(false);

  const isAlreadyOnCloud = setupData?.agent.hostingType === "cloudVM";
  const hasApiKey = !!setupData?.agent.apiKeyPrefix;
  const cloudVmsEnabled = useFeatureFlag(FLAG_KEYS.CLOUD_VMS);

  useEffect(() => {
    fetch(`/api/agents/${agentId}/setup`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          toast.error(data.error);
        } else {
          setSetupData(data);
          // Default to the first VM if available
          if (data.cloudVms?.length > 0) {
            setSelectedVmId(data.cloudVms[0].id);
          }
          // If already on cloud, show cloud tab; otherwise default to cloud
          if (data.agent.hostingType === "cloudVM") {
            setSetupMode("cloud");
          }
        }
      })
      .catch(() => toast.error("Failed to load setup data"))
      .finally(() => setLoading(false));
  }, [agentId]);

  const handleRegenerateKey = useCallback(async () => {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/regenerate-key`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        const key = data.apiKey as string;
        setNewApiKey(key);

        // Patch all $API_KEY placeholders in setup data with the real key
        if (setupData) {
          const patch = (s: string) => s.replaceAll("$API_KEY", key);
          setSetupData({
            ...setupData,
            bootstrapMessage: patch(setupData.bootstrapMessage),
            configFiles: setupData.configFiles.map((f) => ({
              ...f,
              content: patch(f.content),
            })),
          });
        }

        toast.success("API key regenerated — config files updated");
      }
    } catch {
      toast.error("Failed to regenerate API key");
    } finally {
      setRegenerating(false);
    }
  }, [agentId, setupData]);

  const handleDeployToVM = useCallback(async () => {
    if (!selectedVmId) {
      toast.error("Please select a VM");
      return;
    }

    // Show confirmation for re-deployments or when key already exists
    if ((isAlreadyOnCloud || hasApiKey) && !showDeployConfirm) {
      setShowDeployConfirm(true);
      return;
    }

    setShowDeployConfirm(false);
    setDeploying(true);

    try {
      const res = await fetch(`/api/cloud-vms/${selectedVmId}/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId }),
      });

      const text = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(text);
      } catch {
        /* non-JSON response */
      }

      if (!res.ok) {
        toast.error(
          (data.error as string) || `Deploy failed (${res.status}): ${text.slice(0, 200)}`,
        );
        return;
      }

      // Self-healing response (agent already on VM) — show what was fixed
      if ((data.fixedCount as number) > 0) {
        toast.success(`Agent verified — fixed ${data.fixedCount} issue(s)`);
      } else if (data.checks) {
        toast.success(`Agent verified — everything looks good`);
      } else {
        toast.success(`Agent deployed to VM — setting up now`);
      }
      router.push(`/cloud/${selectedVmId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to deploy agent to VM";
      toast.error(msg);
    } finally {
      setDeploying(false);
    }
  }, [agentId, selectedVmId, isAlreadyOnCloud, hasApiKey, showDeployConfirm, router]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!setupData) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Agent not found
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            className="text-muted-foreground hover:text-foreground rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {setupData.agent.setupStatus === "pending_setup" ? "Setup" : "Configuration"} —{" "}
              {setupData.agent.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              {setupData.agent.role}
              {setupData.agent.setupStatus === "pending_setup" && (
                <Badge variant="yellow" className="ml-2">
                  Pending Setup
                </Badge>
              )}
              {isAlreadyOnCloud && (
                <Badge variant="blue" className="ml-2">
                  Cloud VM
                </Badge>
              )}
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Mode toggle — 3 tabs */}
          <div className="flex bg-muted rounded-lg p-1 gap-1">
            <button
              onClick={() => setSetupMode("auto")}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition ${
                setupMode === "auto"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Send className="w-4 h-4" />
              Auto Setup
            </button>
            <button
              onClick={() => setSetupMode("manual")}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition ${
                setupMode === "manual"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Wrench className="w-4 h-4" />
              Manual Setup
            </button>
            {cloudVmsEnabled && (
              <button
                onClick={() => setSetupMode("cloud")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition ${
                  setupMode === "cloud"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Cloud className="w-4 h-4" />
                Deploy to VM
              </button>
            )}
          </div>

          {/* ==================== CLOUD VM MODE ==================== */}
          {setupMode === "cloud" && (
            <>
              {setupData.cloudVms.length === 0 ? (
                <Card padding="lg" className="text-center">
                  <Server className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <h3 className="font-semibold text-foreground mb-1">No Cloud VMs Available</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Create a Cloud VM first to deploy agents to it.
                  </p>
                  <Button onClick={() => router.push("/cloud")}>
                    <Cloud className="w-4 h-4" />
                    Go to Cloud VMs
                  </Button>
                </Card>
              ) : (
                <>
                  {/* Already deployed banner */}
                  {isAlreadyOnCloud && (
                    <div className="border border-blue-200 bg-blue-50 rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <Cloud className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <h3 className="font-semibold text-blue-800 text-sm">Already Deployed</h3>
                          <p className="text-sm text-blue-700 mt-0.5">
                            This agent is already running on a Cloud VM. Re-deploying will reset the
                            API token and reconfigure the agent.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <Card padding="md">
                    <h3 className="font-semibold text-foreground mb-1">Deploy to Cloud VM</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Select a running VM to deploy this agent. The agent will be configured
                      automatically with workspace, config files, and heartbeat cron.
                    </p>

                    {/* VM Selector */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-foreground">Select VM</label>
                      <select
                        value={selectedVmId}
                        onChange={(e) => setSelectedVmId(e.target.value)}
                        disabled={deploying}
                        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${deploying ? "opacity-50 cursor-not-allowed bg-muted border-border" : selectedVmId === setupData.agent.cloudVmId ? "border-success/30 bg-success-muted" : "border-border"}`}
                      >
                        {setupData.cloudVms.map((vm) => (
                          <option key={vm.id} value={vm.id}>
                            {vm.name} — {vm.ipv4 || vm.id.slice(0, 8)} — {vm.region} (
                            {vm.serverType})
                            {setupData.agent.cloudVmId === vm.id ? " ✓ current" : ""}
                          </option>
                        ))}
                      </select>
                      {selectedVmId === setupData.agent.cloudVmId && (
                        <p className="text-xs text-success flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-success inline-block" />
                          Agent is already deployed on this VM — deploying will upgrade config &amp;
                          reset the API token
                        </p>
                      )}
                    </div>

                    {/* Agents on selected VM */}
                    {(() => {
                      const selectedVM = setupData.cloudVms.find((vm) => vm.id === selectedVmId);
                      if (!selectedVM || selectedVM.agents.length === 0) return null;
                      return (
                        <div className="mt-3 border border-border rounded-lg p-3 bg-muted">
                          <p className="text-xs font-medium text-muted-foreground mb-2">
                            {selectedVM.agents.length} agent
                            {selectedVM.agents.length !== 1 ? "s" : ""} on this VM
                          </p>
                          <div className="space-y-1.5">
                            {selectedVM.agents.map((agent) => (
                              <div
                                key={agent.id}
                                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs ${
                                  agent.id === agentId
                                    ? "bg-blue-50 border border-blue-200"
                                    : "bg-background border border-border"
                                }`}
                              >
                                <span className="text-sm leading-none flex-shrink-0">
                                  {agent.identityEmoji || "🤖"}
                                </span>
                                <span
                                  className={`font-medium ${agent.id === agentId ? "text-blue-700" : "text-foreground"}`}
                                >
                                  {agent.name}
                                </span>
                                {agent.role && (
                                  <span className="text-muted-foreground truncate">
                                    {agent.role}
                                  </span>
                                )}
                                {agent.id === agentId && (
                                  <span className="ml-auto text-[10px] text-blue-500 flex-shrink-0">
                                    (this agent)
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Migration warning — moving agent to a different VM */}
                    {isAlreadyOnCloud &&
                      selectedVmId &&
                      selectedVmId !== setupData.agent.cloudVmId && (
                        <div className="mt-3 border-2 border-destructive/30 bg-destructive-muted rounded-xl p-4">
                          <div className="flex items-start gap-3">
                            <ShieldAlert className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <h3 className="font-semibold text-destructive text-sm">
                                Moving to a different VM
                              </h3>
                              <p className="text-sm text-destructive mt-1">
                                The agent will be <strong>removed from the current VM</strong>. All
                                workspace files (MEMORY.md, config, session data) on the old VM will
                                be <strong>permanently deleted</strong> and cannot be recovered. A
                                fresh workspace will be created on the new VM.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                    {/* Confirmation alert */}
                    {showDeployConfirm && (
                      <div className="mt-4 border-2 border-warning/30 bg-warning-muted rounded-xl p-4">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <h3 className="font-semibold text-warning text-sm">
                              Confirm Deployment
                            </h3>
                            <p className="text-sm text-warning mt-1">
                              {isAlreadyOnCloud && selectedVmId !== setupData.agent.cloudVmId
                                ? "The agent will be removed from the old VM and all its files will be permanently deleted. A new API token will be generated on the new VM."
                                : isAlreadyOnCloud
                                  ? "This agent is already deployed. Re-deploying will reset the API token and the agent will take some time to spin up again."
                                  : "The API token will be reset and the agent will take some time to spin up on the VM."}
                            </p>
                            <div className="flex items-center gap-2 mt-3">
                              <Button
                                variant={
                                  isAlreadyOnCloud && selectedVmId !== setupData.agent.cloudVmId
                                    ? "danger"
                                    : "warning"
                                }
                                onClick={handleDeployToVM}
                                disabled={deploying}
                              >
                                {deploying ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Cloud className="w-4 h-4" />
                                )}
                                {isAlreadyOnCloud && selectedVmId !== setupData.agent.cloudVmId
                                  ? "Yes, Move Agent"
                                  : "Yes, Deploy"}
                              </Button>
                              <Button
                                variant="secondary"
                                onClick={() => setShowDeployConfirm(false)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Deploy button (shown when confirm dialog is NOT open) */}
                    {!showDeployConfirm && (
                      <Button
                        onClick={handleDeployToVM}
                        disabled={deploying || !selectedVmId}
                        className="mt-4 w-full"
                      >
                        {deploying ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Cloud className="w-4 h-4" />
                        )}
                        {deploying
                          ? "Deploying..."
                          : selectedVmId === setupData.agent.cloudVmId
                            ? "Upgrade on VM"
                            : isAlreadyOnCloud
                              ? "Move to VM"
                              : "Deploy to VM"}
                      </Button>
                    )}
                  </Card>
                </>
              )}
            </>
          )}

          {/* ==================== AUTO & MANUAL shared: Security + API Key ==================== */}
          {(setupMode === "auto" || setupMode === "manual") && (
            <>
              {/* Security warning */}
              <div className="border-2 border-destructive/30 bg-destructive-muted rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-destructive mb-1">
                      Sensitive Credentials — Handle with Care
                    </h3>
                    <p className="text-sm text-destructive">
                      These credentials grant full access to your Mission Control system. Anyone
                      with them can connect bots to your system. Do not share publicly.
                    </p>
                  </div>
                </div>
              </div>

              {/* API Key section */}
              {newApiKey ? (
                <div className="border-2 border-warning/30 bg-warning-muted rounded-xl p-5">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-warning mb-1">
                        New API Key — Save this now!
                      </h3>
                      <p className="text-sm text-warning mb-3">
                        This key will only be shown once. It has been embedded into the config files
                        and bootstrap message below.
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 px-3 py-2 bg-background border border-warning/30 rounded-lg text-sm font-mono text-foreground break-all select-all">
                          {newApiKey}
                        </code>
                        <CopyButton text={newApiKey} label="API Key" />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <Card padding="md">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <KeyRound className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <h3 className="font-medium text-foreground">API Key</h3>
                        <p className="text-sm text-muted-foreground">
                          {setupData.agent.apiKeyPrefix
                            ? `Current key: ${setupData.agent.apiKeyPrefix}...`
                            : "No API key configured"}
                        </p>
                        <p className="text-xs text-warning mt-1">
                          Config files below use{" "}
                          <code className="bg-warning-muted px-1 rounded">$API_KEY</code>{" "}
                          placeholder. Regenerate to embed the real key.
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={handleRegenerateKey}
                      disabled={regenerating}
                    >
                      {regenerating ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <KeyRound className="w-4 h-4" />
                      )}
                      Regenerate Key
                    </Button>
                  </div>
                </Card>
              )}
            </>
          )}

          {/* ==================== AUTO MODE ==================== */}
          {setupMode === "auto" && (
            <>
              <div className="border border-blue-200 bg-blue-50 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <MessageSquare className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-blue-800 mb-1">
                      Send to Your Connected Channel
                    </h3>
                    <p className="text-sm text-blue-700">
                      Copy the message below and send it to your agent via any connected channel —
                      WhatsApp, Slack, Discord, Telegram, or any other OpenClaw channel.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-foreground">Bootstrap Message</h3>
                  <CopyButton text={setupData.bootstrapMessage} label="Bootstrap message" />
                </div>
                <pre className="px-4 py-3 bg-foreground text-gray-100 rounded-xl text-xs font-mono overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap">
                  {setupData.bootstrapMessage}
                </pre>
              </div>
            </>
          )}

          {/* ==================== MANUAL MODE ==================== */}
          {setupMode === "manual" && (
            <>
              {/* OpenClaw agent config */}
              <div>
                <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Terminal className="w-4 h-4" />
                  1. OpenClaw Agent Config
                </h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Add to <code className="text-xs bg-muted px-1.5 py-0.5 rounded">agents.list</code>{" "}
                  in{" "}
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                    ~/.openclaw/openclaw.json
                  </code>
                  :
                </p>
                <div className="flex items-start gap-2">
                  <pre className="flex-1 px-3 py-2 bg-foreground text-green-400 rounded-lg text-xs font-mono overflow-x-auto">
                    {JSON.stringify(setupData.openclawAgentConfig, null, 2)}
                  </pre>
                  <CopyButton
                    text={JSON.stringify(setupData.openclawAgentConfig, null, 2)}
                    label="Agent config"
                  />
                </div>
              </div>

              {/* Workspace + files */}
              <div>
                <h3 className="font-semibold text-foreground mb-3">
                  2. Create Workspace &amp; Save Files
                </h3>
                <div className="flex items-center gap-2 mb-3">
                  <code className="flex-1 px-3 py-2 bg-foreground text-green-400 rounded-lg text-xs font-mono break-all">
                    mkdir -p {setupData.workspacePath}
                  </code>
                  <CopyButton text={`mkdir -p ${setupData.workspacePath}`} label="mkdir command" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-foreground">Config Files</h3>
                  <DownloadZipButton
                    files={setupData.configFiles}
                    zipName={`${setupData.agent.name.toLowerCase().replace(/\s+/g, "-")}-config.zip`}
                  />
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Extract to{" "}
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                    {setupData.workspacePath}/
                  </code>
                </p>
                <div className="space-y-3">
                  {setupData.configFiles.map((file) => (
                    <details key={file.filename} className="border border-border rounded-lg">
                      <summary className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted">
                        <span className="font-medium text-sm text-foreground">{file.filename}</span>
                        <div className="flex items-center gap-2">
                          <CopyButton text={file.content} label={file.filename} />
                          <DownloadButton filename={file.filename} content={file.content} />
                        </div>
                      </summary>
                      <div className="px-4 pb-4">
                        <pre className="text-xs text-muted-foreground bg-muted rounded-lg p-3 overflow-x-auto max-h-60">
                          {file.content}
                        </pre>
                      </div>
                    </details>
                  ))}
                </div>
              </div>

              {/* Cron */}
              <div>
                <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Terminal className="w-4 h-4" />
                  3. Heartbeat Cron
                </h3>
                <div className="flex items-start gap-2">
                  <code className="flex-1 px-3 py-2 bg-foreground text-green-400 rounded-lg text-xs font-mono break-all">
                    {setupData.cronCommand}
                  </code>
                  <CopyButton text={setupData.cronCommand} label="Cron command" />
                </div>
              </div>
            </>
          )}

          {/* Back to agents */}
          <div className="flex justify-end pt-2">
            <Button onClick={() => router.back()}>
              <Check className="w-4 h-4" />
              Done
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
