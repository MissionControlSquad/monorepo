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
  MonitorDown,
} from "lucide-react";
import { Button, Badge, Card } from "@/components/ui";
import { type AgentConfigFile } from "@agentcenter/utils";
import { useIsElectron } from "@agentcenter/hooks/browser";
import { DesktopBootstrapButton } from "@/components/common/DesktopBootstrapButton";
import { SetupStatus } from "@/server/constants";

interface SetupData {
  agent: {
    id: string;
    name: string;
    role: string;
    setupStatus: string;
    apiKeyPrefix: string | null;
    hostingType: string;
  };
  configFiles: AgentConfigFile[];
  bootstrapMessage: string;
  cronSchedule: string;
  cronMessage: string;
  cronCommand: string;
  workspacePath: string;
  openclawAgentConfig: { id: string; name: string; workspace: string };
  requiredClis: string[];
  mcUrl: string;
}

type SetupMode = "auto" | "manual" | "desktop";

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

function DownloadZipButton({ files, zipName }: { files: AgentConfigFile[]; zipName: string }) {
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
  const isDesktopApp = useIsElectron();
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [setupMode, setSetupMode] = useState<SetupMode>("auto");
  const [newApiKey, setNewApiKey] = useState<string | null>(null);

  // Once isDesktopApp resolves (after hydration), switch to the desktop tab.
  // Only switches if the user hasn't already manually picked a different tab.
  useEffect(() => {
    if (isDesktopApp) setSetupMode("desktop");
  }, [isDesktopApp]);

  useEffect(() => {
    fetch(`/api/agents/${agentId}/setup`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          toast.error(data.error);
        } else {
          setSetupData(data);
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
              {setupData.agent.setupStatus === SetupStatus.PENDING_SETUP
                ? "Setup"
                : "Configuration"}{" "}
              — {setupData.agent.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              {setupData.agent.role}
              {setupData.agent.setupStatus === SetupStatus.PENDING_SETUP && (
                <Badge variant="yellow" className="ml-2">
                  Pending Setup
                </Badge>
              )}
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Mode toggle */}
          <div className="flex bg-muted rounded-lg p-1 gap-1">
            {isDesktopApp && (
              <button
                onClick={() => setSetupMode("desktop")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition ${
                  setupMode === "desktop"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <MonitorDown className="w-4 h-4" />
                Desktop App
              </button>
            )}
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
          </div>

          {/* ==================== DESKTOP APP TAB ==================== */}
          {setupMode === "desktop" && (
            <DesktopBootstrapButton
              payload={{
                agentId,
                agentName: setupData.agent.name,
                workspacePath: setupData.workspacePath,
                configFiles: setupData.configFiles,
                requiredClis: setupData.requiredClis,
                cronSchedule: setupData.cronSchedule,
                cronMessage: setupData.cronMessage,
              }}
              onComplete={() => {
                fetch(`/api/agents/${agentId}/setup`)
                  .then((r) => r.json())
                  .then((data) => {
                    if (!data.error) setSetupData(data);
                  })
                  .catch(() => {});
              }}
            />
          )}

          {/* ==================== AUTO & MANUAL shared: Security + API Key ==================== */}
          {(setupMode === "auto" || setupMode === "manual" || setupMode === "desktop") && (
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
