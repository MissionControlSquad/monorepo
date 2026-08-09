"use client";

import { truncateId } from "@agentcenter/utils";
import { API_ROUTES } from "@/lib/api-routes";
import { useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Zap,
  Plus,
  Trash2,
  Copy,
  Check,
  Key,
  AlertTriangle,
  X,
  Loader2,
  Monitor,
  Wifi,
  WifiOff,
  ChevronDown,
  ChevronRight,
  Terminal,
  ArrowRight,
  CheckCircle2,
  ShieldAlert,
  ShieldCheck,
  Clock,
  PlugZap,
  Radio,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation } from "urql";
import { LIVE_GATEWAY_DEVICES_QUERY } from "@/lib/graphql/queries";
import { APPROVE_LIVE_GATEWAY_DEVICE, REVOKE_LIVE_GATEWAY_DEVICE } from "@/lib/graphql/mutations";
import {
  Breadcrumbs,
  Button,
  Badge,
  Card,
  Input,
  EmptyState,
  PageLayout,
  Checkbox,
} from "../components/ui";
import { ErrorBoundary, PanelErrorFallback } from "../components/common/ErrorBoundary";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Token {
  id: string;
  prefix: string;
  name: string | null;
  maskedToken: string;
}

interface NewTokenResult {
  token: string;
  prefix: string;
  name: string | null;
}

interface LiveConnection {
  id: string;
  machineName: string | null;
  connectionStatus: string;
  connectedAt: string | null;
  lastDisconnectedAt: string | null;
  pluginVersion: string | null;
  agentSlugs: string[];
  createdAt: string;
}

interface Device {
  id: string;
  machineFingerprint: string;
  label: string | null;
  status: string;
  approvedByProfileId: string | null;
  approvedAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
}

type Tab = "connections" | "tokens" | "devices";
type WizardStep = "prereq" | "token" | "install" | "waiting" | "done";
type OS = "mac" | "windows" | "linux";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function wsUrlFromOrigin(): string {
  if (typeof window === "undefined") return "ws://localhost:3000/live-gateway";
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/live-gateway`;
}

// ─── Shared primitives ────────────────────────────────────────────────────────

/** Inline callout used in modals — warning / info / success / danger */
function Callout({
  variant,
  icon,
  children,
}: {
  variant: "warning" | "info" | "success" | "danger";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const styles = {
    warning:
      "bg-amber-500/10 border-amber-500/25 text-amber-700 dark:text-amber-400 [&_code]:bg-amber-500/15",
    info: "bg-primary/8 border-primary/20 text-primary [&_code]:bg-primary/15",
    success: "bg-success/10 border-success/25 text-success [&_code]:bg-success/15",
    danger: "bg-destructive/10 border-destructive/25 text-destructive [&_code]:bg-destructive/15",
  };
  return (
    <div
      className={`flex items-start gap-2.5 p-3 rounded-lg border text-xs leading-relaxed ${styles[variant]}`}
    >
      <span className="flex-shrink-0 mt-px [&_svg]:w-3.5 [&_svg]:h-3.5">{icon}</span>
      <div className="min-w-0 [&_code]:rounded [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-[11px]">
        {children}
      </div>
    </div>
  );
}

/** Mono code block with optional copy button */
function CodeBlock({
  code,
  onCopy,
  copied,
}: {
  code: string;
  onCopy?: () => void;
  copied?: boolean;
}) {
  return (
    <div className="relative group">
      <pre className="text-xs bg-muted rounded-lg px-3.5 py-3 font-mono text-foreground overflow-x-auto whitespace-pre select-all leading-relaxed">
        {code}
      </pre>
      {onCopy && (
        <button
          onClick={onCopy}
          className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-md bg-background border border-border text-[10px] font-medium text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-all"
        >
          {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      )}
    </div>
  );
}

/** Single step row in the wizard checklist */
function StepItem({
  status,
  label,
  detail,
}: {
  status: "pending" | "active" | "done";
  label: string;
  detail?: string;
}) {
  return (
    <div
      className={`flex items-start gap-3 transition-opacity ${status === "pending" ? "opacity-40" : "opacity-100"}`}
    >
      <div className="flex-shrink-0 mt-0.5">
        {status === "done" ? (
          <CheckCircle2 className="w-4 h-4 text-success" />
        ) : status === "active" ? (
          <div className="w-4 h-4 rounded-full bg-primary/20 ring-2 ring-primary flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
          </div>
        ) : (
          <div className="w-4 h-4 rounded-full border-2 border-border" />
        )}
      </div>
      <div className="min-w-0 pt-px">
        <p
          className={`text-sm font-medium leading-snug ${status === "done" ? "text-muted-foreground" : "text-foreground"}`}
        >
          {label}
        </p>
        {detail && status !== "pending" && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{detail}</p>
        )}
      </div>
    </div>
  );
}

/** Modal shell — backdrop + centred card */
function ModalShell({
  children,
  maxWidth = "max-w-lg",
}: {
  children: React.ReactNode;
  maxWidth?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div
        className={`bg-background border border-border rounded-2xl shadow-2xl w-full ${maxWidth} flex flex-col max-h-[92vh]`}
      >
        {children}
      </div>
    </div>
  );
}

/** Consistent modal header row */
function ModalHeader({
  icon,
  title,
  onClose,
}: {
  icon: React.ReactNode;
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
      <div className="flex items-center gap-2.5">
        <span className="text-primary [&_svg]:w-4 [&_svg]:h-4">{icon}</span>
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </div>
      <button
        onClick={onClose}
        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

/** Modal footer with cancel + primary action */
function ModalFooter({
  onCancel,
  cancelLabel = "Cancel",
  children,
}: {
  onCancel?: () => void;
  cancelLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-t border-border flex-shrink-0 bg-muted/30 rounded-b-2xl">
      {onCancel ? (
        <button
          onClick={onCancel}
          className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {cancelLabel}
        </button>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

// ─── Setup Wizard ─────────────────────────────────────────────────────────────

interface WizardProps {
  onClose: () => void;
  onConnectionEstablished: () => void;
  existingConnectionIds: Set<string>;
}

const WIZARD_STEPS: { key: WizardStep; label: string }[] = [
  { key: "prereq", label: "Get ready" },
  { key: "token", label: "Setup key" },
  { key: "install", label: "Install" },
  { key: "waiting", label: "Connect" },
  { key: "done", label: "You're live!" },
];

const STEP_INDEX: Record<WizardStep, number> = {
  prereq: 0,
  token: 1,
  install: 2,
  waiting: 3,
  done: 4,
};

function SetupWizard({ onClose, onConnectionEstablished, existingConnectionIds }: WizardProps) {
  const [step, setStep] = useState<WizardStep>("prereq");
  const [os, setOs] = useState<OS>("mac");
  const [tokenName, setTokenName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<NewTokenResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [installChecks, setInstallChecks] = useState({
    ran: false,
    config: false,
    restarted: false,
  });
  const [connectedMachine, setConnectedMachine] = useState<LiveConnection | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mcUrl = wsUrlFromOrigin();

  const currentIndex = STEP_INDEX[step];

  const installDone = installChecks.ran && installChecks.config && installChecks.restarted;

  // Poll on "waiting" step
  useEffect(() => {
    if (step !== "waiting") return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(API_ROUTES.liveGateway.connections);
        if (!res.ok) return;
        const data = await res.json();
        const connections: LiveConnection[] = data.connections ?? [];
        const newConn = connections.find((c) => !existingConnectionIds.has(c.id));
        if (newConn) {
          clearInterval(pollRef.current!);
          setConnectedMachine(newConn);
          onConnectionEstablished();
          setTimeout(() => setStep("done"), 1000);
        }
      } catch {
        /* ignore */
      }
    }, 3_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [step, existingConnectionIds, onConnectionEstablished]);

  async function handleCreateToken() {
    setCreating(true);
    try {
      const res = await fetch(API_ROUTES.liveGateway.tokens, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: tokenName.trim() || undefined }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setNewToken({ token: data.token, prefix: data.prefix, name: data.name });
      setStep("install");
    } catch {
      toast.error("Failed to generate token");
    } finally {
      setCreating(false);
    }
  }

  function handleCopy() {
    if (!newToken) return;
    navigator.clipboard.writeText(configSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const configSnippet = newToken
    ? JSON.stringify(
        {
          plugins: {
            entries: {
              "agentcenter-bridge": {
                enabled: true,
                config: { agentCenterUrl: mcUrl, token: newToken.token },
              },
            },
          },
        },
        null,
        2,
      )
    : "";

  return (
    <ModalShell maxWidth="max-w-2xl">
      <ModalHeader
        icon={step === "done" ? <CheckCircle2 /> : <Radio />}
        title={
          step === "prereq"
            ? "Connect a machine — let's get ready"
            : step === "done"
              ? "Setup complete"
              : "Connect a machine"
        }
        onClose={onClose}
      />

      {/* Progress */}
      <div className="px-6 pt-5 pb-4 flex-shrink-0 space-y-3 border-b border-border">
        <div className="h-1 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
            style={{ width: `${((currentIndex + 1) / WIZARD_STEPS.length) * 100}%` }}
          />
        </div>
        <div className="flex justify-between">
          {WIZARD_STEPS.map((s, i) => {
            const done = i < currentIndex;
            const active = i === currentIndex;
            return (
              <div key={s.key} className="flex flex-col items-center gap-1">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                    done
                      ? "bg-primary text-primary-foreground"
                      : active
                        ? "bg-primary/15 text-primary ring-2 ring-primary"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {done ? <Check className="w-3 h-3" /> : i + 1}
                </div>
                <span
                  className={`text-[10px] font-medium leading-none ${active ? "text-foreground" : "text-muted-foreground"}`}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {/* ── Step 0: Prerequisites ── */}
        {step === "prereq" && (
          <>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">Before you begin</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                You'll connect a machine so agents running on it receive tasks instantly — no
                waiting. This takes about 5 minutes.
              </p>
            </div>

            {/* OS picker — first so requirements update reactively */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-foreground">
                Which OS is the target machine running?
              </p>
              <div className="flex gap-2">
                {(["mac", "windows", "linux"] as OS[]).map((o) => (
                  <button
                    key={o}
                    onClick={() => setOs(o)}
                    className={`flex-1 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                      os === o
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    {o === "mac" ? "macOS" : o === "windows" ? "Windows" : "Linux"}
                  </button>
                ))}
              </div>
            </div>

            {/* OS-specific requirements */}
            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-foreground">
                What you need on that machine:
              </p>

              <div className="space-y-2">
                {(os === "mac"
                  ? [
                      {
                        icon: <Monitor className="w-4 h-4" />,
                        label: "OpenClaw for macOS",
                        detail:
                          "Download and install the OpenClaw Mac app (.dmg). Works on macOS 12 Monterey or later (Intel or Apple Silicon).",
                      },
                      {
                        icon: <Terminal className="w-4 h-4" />,
                        label: "Terminal",
                        detail:
                          'Built into macOS — open it from Applications → Utilities → Terminal, or search Spotlight for "Terminal".',
                      },
                      {
                        icon: <CheckCircle2 className="w-4 h-4" />,
                        label: "curl (pre-installed)",
                        detail:
                          "curl comes with every modern Mac. You'll use it to download the bridge plugin in one command.",
                      },
                      {
                        icon: <Wifi className="w-4 h-4" />,
                        label: "Outbound internet access",
                        detail:
                          "The machine needs to reach this server over the network. Most home and office networks already allow this.",
                      },
                    ]
                  : os === "windows"
                    ? [
                        {
                          icon: <Monitor className="w-4 h-4" />,
                          label: "OpenClaw for Windows",
                          detail:
                            "Download and run the OpenClaw Windows installer (.exe). Works on Windows 10 or Windows 11.",
                        },
                        {
                          icon: <Terminal className="w-4 h-4" />,
                          label: "PowerShell 5.1 or later",
                          detail:
                            'Built into Windows 10 and 11. Search the Start menu for "PowerShell" and open it. No extra install needed.',
                        },
                        {
                          icon: <CheckCircle2 className="w-4 h-4" />,
                          label: "Invoke-WebRequest (built-in)",
                          detail:
                            "Part of PowerShell — you'll use it to download the plugin. No extra tools required.",
                        },
                        {
                          icon: <Wifi className="w-4 h-4" />,
                          label: "Outbound internet access",
                          detail:
                            "The machine needs to reach this server. If you're behind a corporate firewall, check with your IT team.",
                        },
                      ]
                    : [
                        {
                          icon: <Monitor className="w-4 h-4" />,
                          label: "OpenClaw for Linux",
                          detail:
                            "Install OpenClaw using the package for your distro (deb, rpm, or AppImage). Works on Ubuntu 20.04+, Debian 11+, Fedora 36+, and most modern distros.",
                        },
                        {
                          icon: <Terminal className="w-4 h-4" />,
                          label: "A terminal emulator",
                          detail:
                            "Any terminal works — GNOME Terminal, Konsole, xterm, or an SSH session into the machine.",
                        },
                        {
                          icon: <CheckCircle2 className="w-4 h-4" />,
                          label: "curl",
                          detail:
                            "Usually pre-installed. If not: sudo apt install curl (Debian/Ubuntu) or sudo dnf install curl (Fedora/RHEL).",
                        },
                        {
                          icon: <Wifi className="w-4 h-4" />,
                          label: "Outbound internet access",
                          detail:
                            "The machine needs to reach this server. Most servers already have outbound HTTP/HTTPS allowed.",
                        },
                      ]
                ).map(({ icon, label, detail }) => (
                  <div
                    key={label}
                    className="flex items-start gap-3 p-3 rounded-xl bg-muted/50 border border-border"
                  >
                    <span className="flex-shrink-0 mt-0.5 text-muted-foreground [&_svg]:w-4 [&_svg]:h-4">
                      {icon}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground">{label}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                        {detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Callout variant="info" icon={<Zap />}>
              <strong>Don't have OpenClaw yet?</strong>{" "}
              {os === "mac"
                ? "Download the .dmg from the OpenClaw website, open it, and drag OpenClaw to Applications."
                : os === "windows"
                  ? "Download the .exe installer from the OpenClaw website and run it. No admin rights needed for a user install."
                  : "Download the package for your distro from the OpenClaw website and follow the install instructions for your package manager."}
            </Callout>
          </>
        )}

        {/* ── Step 1: Token ── */}
        {step === "token" && (
          <>
            <div className="space-y-3.5">
              <StepItem status="done" label="Prerequisites checked" />
              <StepItem
                status="active"
                label="Generate a one-time setup key"
                detail="This key pairs the machine with Mission Control. It's replaced automatically after the machine connects for the first time."
              />
              <StepItem status="pending" label="Install the bridge plugin" />
              <StepItem status="pending" label="Machine connects and agents register" />
            </div>
            <div className="space-y-2 pt-1">
              <label className="text-xs font-medium text-foreground">
                Give this machine a name{" "}
                <span className="text-muted-foreground font-normal">
                  (optional but recommended)
                </span>
              </label>
              <Input
                placeholder={`e.g. ${os === "mac" ? "mac-mini-office, macbook-pro" : os === "windows" ? "office-pc, windows-vm" : "linux-server, ubuntu-vm"}`}
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !creating && handleCreateToken()}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                This name appears on the Machines tab so you can tell machines apart.
              </p>
            </div>
          </>
        )}

        {/* ── Step 2: Install ── */}
        {step === "install" && newToken && (
          <>
            <div className="space-y-3.5">
              <StepItem
                status="done"
                label="Setup key generated"
                detail={newToken.name ?? `Key prefix: ${newToken.prefix}`}
              />
              <StepItem status="active" label="Install the bridge plugin and paste config" />
              <StepItem status="pending" label="Machine connects and agents register" />
            </div>

            <Callout variant="warning" icon={<AlertTriangle />}>
              <strong>Copy the config below before closing this screen.</strong> The setup key
              inside it is shown once — you cannot retrieve it later. If you lose it, generate a new
              one from the Setup Keys tab.
            </Callout>

            {/* OS context */}
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">Instructions for:</p>
              <div className="flex gap-1.5">
                {(["mac", "windows", "linux"] as OS[]).map((o) => (
                  <button
                    key={o}
                    onClick={() => setOs(o)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                      os === o
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {o === "mac" ? "Mac" : o === "windows" ? "Windows" : "Linux"}
                  </button>
                ))}
              </div>
            </div>

            {/* Step A — install via ClawHub */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
                {os === "windows"
                  ? "A. Open PowerShell on that machine and run:"
                  : "A. Open Terminal on that machine and run:"}
              </p>
              <CodeBlock code="openclaw plugins install clawhub:@agentcenter/agentcenter-bridge" />
              <p className="text-[11px] text-muted-foreground">
                Installs the AgentCenter Bridge plugin directly from ClawHub — works on Mac, Linux,
                and Windows.
              </p>
            </div>

            {/* Step B — config snippet */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-muted-foreground" />
                  B. Merge this into your{" "}
                  <span className="font-mono">~/.openclaw/openclaw.json</span>:
                </p>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-success" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <CodeBlock code={configSnippet} onCopy={handleCopy} copied={copied} />
            </div>

            {/* Step C — restart */}
            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
              <p className="text-xs font-semibold text-foreground mb-0.5">C. Restart OpenClaw</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {os === "windows"
                  ? "Right-click the OpenClaw icon in the taskbar → Quit, then reopen it."
                  : os === "mac"
                    ? "In the menu bar, click the OpenClaw icon → Quit, then reopen it from Applications."
                    : "Stop and restart the OpenClaw process (or service)."}
              </p>
            </div>

            {/* Done checklist */}
            <div className="space-y-2 pt-1">
              <p className="text-xs font-semibold text-foreground">
                Tick each off as you complete it:
              </p>
              {(
                [
                  { key: "ran", label: "Ran the install command in Terminal" },
                  { key: "config", label: "Pasted the config block into OpenClaw" },
                  { key: "restarted", label: "Restarted OpenClaw" },
                ] as const
              ).map(({ key, label }) => (
                <label
                  key={key}
                  className="flex items-center gap-2.5 p-3 rounded-xl border border-border hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  <Checkbox
                    checked={installChecks[key]}
                    onChange={() => setInstallChecks((p) => ({ ...p, [key]: !p[key] }))}
                    className="flex-shrink-0 cursor-pointer"
                  />
                  <span className="text-xs text-foreground">{label}</span>
                </label>
              ))}
            </div>
          </>
        )}

        {/* ── Step 3: Waiting ── */}
        {step === "waiting" && (
          <>
            <div className="space-y-3.5">
              <StepItem status="done" label="Setup key generated" />
              <StepItem status="done" label="Plugin installed and configured" />
              <StepItem
                status={connectedMachine ? "done" : "active"}
                label={
                  connectedMachine ? "Machine connected!" : "Waiting for your machine to connect…"
                }
                detail={
                  connectedMachine
                    ? `${connectedMachine.machineName || truncateId(connectedMachine.id, 12)} · ${connectedMachine.agentSlugs.length} agent${connectedMachine.agentSlugs.length !== 1 ? "s" : ""} registered`
                    : "Checking automatically every 3 seconds"
                }
              />
            </div>

            {!connectedMachine ? (
              <>
                <Callout variant="info" icon={<Loader2 className="animate-spin" />}>
                  Waiting for <strong>{tokenName || "your machine"}</strong> to connect. Make sure
                  OpenClaw is open and running on that machine — this screen will advance
                  automatically.
                </Callout>

                <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
                  <p className="text-xs font-semibold text-foreground">
                    Not connecting? Try these:
                  </p>
                  <ul className="space-y-1.5 text-[11px] text-muted-foreground leading-relaxed list-disc list-inside">
                    <li>Make sure OpenClaw is open and not minimised</li>
                    <li>
                      Check that agentcenter-bridge shows as{" "}
                      <strong className="text-foreground">Enabled</strong> in OpenClaw → Plugins
                    </li>
                    <li>
                      Confirm the machine has internet access and can reach{" "}
                      <code className="bg-muted rounded px-1 font-mono text-[10px]">
                        {typeof window !== "undefined" ? window.location.host : "this server"}
                      </code>
                    </li>
                    <li>If you restarted OpenClaw, wait 10–15 seconds for it to initialise</li>
                    <li>Go back and re-check the config was pasted correctly</li>
                  </ul>
                </div>
              </>
            ) : (
              <Callout variant="success" icon={<CheckCircle2 />}>
                <strong>Your machine connected!</strong> Moving to the final step…
              </Callout>
            )}
          </>
        )}

        {/* ── Step 4: Done ── */}
        {step === "done" && connectedMachine && (
          <>
            {/* Success banner */}
            <div className="rounded-xl border border-success/30 bg-success/8 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
                <p className="text-sm font-semibold text-success">You're live!</p>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong className="text-foreground">
                  {connectedMachine.machineName || "This machine"}
                </strong>{" "}
                is now connected. Tasks assigned to its agents are delivered in real time — no
                waiting for the next heartbeat cycle.
              </p>
              {connectedMachine.agentSlugs.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {connectedMachine.agentSlugs.map((slug) => (
                    <span
                      key={slug}
                      className="inline-flex items-center px-2 py-0.5 rounded-full bg-success/15 text-[11px] text-success font-mono font-medium"
                    >
                      @{slug}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <Callout variant="info" icon={<CheckCircle2 />}>
              Your setup key keeps working across restarts — no manual key rotation needed. If you
              ever need to revoke access for this machine, use the Setup Keys tab.
            </Callout>
          </>
        )}
      </div>

      <ModalFooter onCancel={step !== "done" ? onClose : undefined}>
        {step === "prereq" && (
          <Button
            variant="primary"
            size="sm"
            icon={<ArrowRight />}
            onClick={() => setStep("token")}
          >
            Looks good, continue
          </Button>
        )}
        {step === "token" && (
          <>
            <Button variant="ghost" size="sm" onClick={() => setStep("prereq")}>
              Back
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreateToken}
              disabled={creating}
              icon={creating ? <Loader2 className="animate-spin" /> : <Key />}
            >
              {creating ? "Generating…" : "Generate setup key"}
            </Button>
          </>
        )}
        {step === "install" && (
          <Button
            variant="primary"
            size="sm"
            icon={<ArrowRight />}
            disabled={!installDone}
            onClick={() => setStep("waiting")}
          >
            I've done all three steps
          </Button>
        )}
        {step === "waiting" && !connectedMachine && (
          <Button variant="secondary" size="sm" onClick={() => setStep("install")}>
            Back to instructions
          </Button>
        )}
        {step === "done" && (
          <Button variant="primary" size="sm" icon={<Check />} onClick={onClose}>
            Done
          </Button>
        )}
      </ModalFooter>
    </ModalShell>
  );
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

function DeleteConfirmModal({
  conn,
  onClose,
  onDeleted,
}: {
  conn: LiveConnection;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const machineName = conn.machineName || truncateId(conn.id, 12);
  const hasAgents = conn.agentSlugs.length > 0;
  const [checks, setChecks] = useState({ stopped: false, configRemoved: false, confirmed: false });
  const [deleting, setDeleting] = useState(false);
  const [skipCleanup, setSkip] = useState(false);

  const allChecked = checks.stopped && checks.configRemoved && checks.confirmed;
  const canDelete = allChecked || skipCleanup;

  function toggle(key: keyof typeof checks) {
    setChecks((p) => ({ ...p, [key]: !p[key] }));
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/live-gateway/connections/${conn.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to remove machine");
        return;
      }
      toast.success(`"${machineName}" removed`);
      onDeleted();
      onClose();
    } catch {
      toast.error("Failed to remove machine");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <ModalShell maxWidth="max-w-md">
      <ModalHeader icon={<Trash2 />} title="Remove machine" onClose={onClose} />

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        {/* Machine identity */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-muted border border-border">
          <div className="w-8 h-8 rounded-lg bg-background border border-border flex items-center justify-center flex-shrink-0">
            <Monitor className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{machineName}</p>
            {conn.pluginVersion && (
              <p className="text-xs text-muted-foreground font-mono">v{conn.pluginVersion}</p>
            )}
          </div>
          <Badge variant="gray">Offline</Badge>
        </div>

        {/* Agent warning */}
        {hasAgents && (
          <Callout variant="warning" icon={<ShieldAlert />}>
            <strong className="block mb-1">
              {conn.agentSlugs.length} agent{conn.agentSlugs.length !== 1 ? "s" : ""} registered on
              this machine.
            </strong>
            <div className="flex flex-wrap gap-1 mb-1.5">
              {conn.agentSlugs.map((slug) => (
                <span
                  key={slug}
                  className="inline-flex items-center px-1.5 py-px rounded bg-amber-500/15 font-mono text-[10px]"
                >
                  @{slug}
                </span>
              ))}
            </div>
            If the plugin is still running, it will attempt reconnection after deletion. Mission
            Control will reject it with <code>auth_failed</code> and the plugin will self-stop — but
            a few retry attempts will occur. Follow the cleanup steps below to prevent this
            entirely.
          </Callout>
        )}

        {/* Impact summary */}
        <Callout variant="info" icon={<PlugZap />}>
          <strong className="block mb-1">What deletion does:</strong>
          <ul className="space-y-0.5 list-disc list-inside">
            <li>Connection record and agent routes removed from Mission Control</li>
            <li>Live task delivery to this machine stops immediately</li>
            <li>
              Reconnect attempts receive <code>auth_failed</code> — plugin self-stops
            </li>
            <li>
              Heartbeat polling is <strong>unaffected</strong> — agents keep working
            </li>
          </ul>
        </Callout>

        {/* Cleanup checklist */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
            Cleanup steps — run on <strong>{machineName}</strong>
          </p>

          {/* Step 1 */}
          <label className="flex items-start gap-3 p-3.5 rounded-xl border border-border hover:bg-muted/50 transition-colors cursor-pointer group">
            <Checkbox
              checked={checks.stopped}
              onChange={() => toggle("stopped")}
              className="mt-0.5 flex-shrink-0 cursor-pointer"
            />
            <div className="space-y-1.5 min-w-0">
              <p className="text-xs font-semibold text-foreground leading-snug">
                Stop the AgentCenter Bridge plugin
              </p>
              <div className="space-y-1">
                <code className="block text-[11px] bg-muted rounded px-2.5 py-1.5 font-mono text-foreground select-all">
                  openclaw plugins disable agentcenter-bridge
                </code>
                <p className="text-[11px] text-muted-foreground">or quit OpenClaw entirely</p>
              </div>
            </div>
          </label>

          {/* Step 2 */}
          <label className="flex items-start gap-3 p-3.5 rounded-xl border border-border hover:bg-muted/50 transition-colors cursor-pointer group">
            <Checkbox
              checked={checks.configRemoved}
              onChange={() => toggle("configRemoved")}
              className="mt-0.5 flex-shrink-0 cursor-pointer"
            />
            <div className="space-y-1.5 min-w-0">
              <p className="text-xs font-semibold text-foreground leading-snug">
                Remove AgentCenter Bridge from config &amp; uninstall
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Delete the{" "}
                <code className="rounded px-1 py-px bg-muted font-mono text-[10px]">
                  agentcenter-bridge
                </code>{" "}
                block from your OpenClaw plugin config, then optionally uninstall:
              </p>
              <code className="block text-[11px] bg-muted rounded px-2.5 py-1.5 font-mono text-foreground select-all">
                openclaw plugins uninstall agentcenter-bridge
              </code>
            </div>
          </label>

          {/* Step 3 */}
          <label className="flex items-start gap-3 p-3.5 rounded-xl border border-border hover:bg-muted/50 transition-colors cursor-pointer group">
            <Checkbox
              checked={checks.confirmed}
              onChange={() => toggle("confirmed")}
              className="mt-0.5 flex-shrink-0 cursor-pointer"
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground leading-snug">
                Plugin is no longer running on this machine
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                No further WebSocket attempts will be made from this machine.
              </p>
            </div>
          </label>
        </div>

        {/* Skip option */}
        <label className="flex items-center gap-2.5 cursor-pointer">
          <Checkbox
            checked={skipCleanup}
            onChange={() => setSkip((v) => !v)}
            className="accent-destructive flex-shrink-0 cursor-pointer"
          />
          <span className="text-xs text-muted-foreground leading-snug">
            Machine is unreachable / already gone — delete anyway
          </span>
        </label>

        {skipCleanup && (
          <Callout variant="danger" icon={<AlertTriangle />}>
            If the plugin is still running on the machine, it will attempt a few reconnects and
            receive <code>auth_failed</code>. The plugin will self-stop automatically — no manual
            action required, but expect a brief spike in failed WebSocket attempts.
          </Callout>
        )}
      </div>

      <ModalFooter onCancel={onClose}>
        <Button
          variant="danger"
          size="sm"
          onClick={handleDelete}
          disabled={!canDelete || deleting}
          icon={deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
        >
          {deleting ? "Removing…" : "Delete connection"}
        </Button>
      </ModalFooter>
    </ModalShell>
  );
}

// ─── Token panel ──────────────────────────────────────────────────────────────

function TokenPanel() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setErr] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [newToken, setNewToken] = useState<NewTokenResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const fetchTokens = useCallback(async () => {
    try {
      const res = await fetch(API_ROUTES.liveGateway.tokens);
      if (res.ok) {
        setTokens((await res.json()).tokens ?? []);
        setErr(false);
      } else setErr(true);
    } catch {
      setErr(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await fetch(API_ROUTES.liveGateway.tokens, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() || undefined }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setNewToken({ token: data.token, prefix: data.prefix, name: data.name });
      setNewName("");
      setShowForm(false);
      await fetchTokens();
    } catch {
      toast.error("Failed to generate token");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    setRevoking(id);
    try {
      const res = await fetch(`/api/live-gateway/tokens/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Token revoked");
      setTokens((p) => p.filter((t) => t.id !== id));
    } catch {
      toast.error("Failed to revoke token");
    } finally {
      setRevoking(null);
    }
  }

  function handleCopyToken() {
    if (!newToken) return;
    navigator.clipboard.writeText(newToken.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Setup Keys</h2>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            One-time keys used to pair a new machine with Mission Control. After the machine
            connects for the first time, it automatically receives a permanent key — the setup key
            is used only once.
          </p>
        </div>
        {!showForm && (
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus />}
            onClick={() => setShowForm(true)}
            className="flex-shrink-0"
          >
            Generate
          </Button>
        )}
      </div>

      {/* Create form */}
      {showForm && (
        <Card className="p-4 space-y-3 border-primary/30 bg-primary/5">
          <p className="text-xs font-semibold text-foreground">New setup key</p>
          <Input
            placeholder="Label (optional — e.g. dev-laptop, mac-mini-office)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !creating && handleCreate()}
            autoFocus
          />
          <p className="text-[11px] text-muted-foreground">
            After generating, copy the token immediately — it cannot be retrieved later.
          </p>
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreate}
              disabled={creating}
              icon={creating ? <Loader2 className="animate-spin" /> : <Key />}
            >
              {creating ? "Generating…" : "Generate token"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowForm(false);
                setNewName("");
              }}
            >
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {/* Newly generated token reveal */}
      {newToken && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                  Copy now — this setup key is shown once only.
                </p>
                {newToken.name && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                    Label: {newToken.name}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={() => setNewToken(null)}
              className="text-amber-600 hover:text-amber-800 dark:hover:text-amber-300 transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-background border border-amber-500/25 rounded-lg px-3 py-2.5 font-mono break-all select-all text-foreground leading-relaxed">
              {newToken.token}
            </code>
            <button
              onClick={handleCopyToken}
              className="flex-shrink-0 p-2.5 rounded-lg border border-amber-500/25 bg-background hover:bg-amber-500/10 transition-colors"
              title="Copy token"
            >
              {copied ? (
                <Check className="w-4 h-4 text-success" />
              ) : (
                <Copy className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              )}
            </button>
          </div>
          <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
            Paste this as the{" "}
            <code className="rounded px-1 py-px bg-amber-500/15 font-mono">token</code> in your
            agentcenter-bridge plugin config. After first connect, OpenClaw prints a permanent key —
            replace this setup key with that one to finish pairing.
          </p>
        </div>
      )}

      {/* Token list */}
      {loading ? (
        <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading tokens…
        </div>
      ) : fetchError ? (
        <p className="text-xs text-destructive py-2">Failed to load tokens. Please refresh.</p>
      ) : tokens.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <Key className="w-8 h-8 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">No active setup keys.</p>
          <p className="text-[11px] text-muted-foreground/70">
            Use "Connect machine" to generate one during the setup wizard.
          </p>
        </div>
      ) : (
        <Card className="overflow-hidden divide-y divide-border">
          {tokens.map((token) => (
            <div
              key={token.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors group"
            >
              <div className="w-7 h-7 rounded-lg bg-muted border border-border flex items-center justify-center flex-shrink-0">
                <Key className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">
                  {token.name ?? "Unnamed token"}
                </p>
                <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                  {token.maskedToken}
                </p>
              </div>
              <button
                onClick={() => handleRevoke(token.id)}
                disabled={revoking === token.id}
                className="flex-shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100"
                title="Revoke token"
              >
                {revoking === token.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

// ─── Connection card ──────────────────────────────────────────────────────────

function ConnectionCard({
  conn,
  onRemove,
}: {
  conn: LiveConnection;
  onRemove: (id: string) => void;
}) {
  const isLive = conn.connectionStatus === "connected";
  const [expanded, setExp] = useState(false);
  const [showDel, setDel] = useState(false);

  const lastSeenLabel = isLive
    ? conn.connectedAt
      ? `Connected ${relativeTime(conn.connectedAt)}`
      : "Connected"
    : conn.lastDisconnectedAt
      ? `Last seen ${relativeTime(conn.lastDisconnectedAt)}`
      : "Never connected";

  return (
    <>
      {showDel && (
        <DeleteConfirmModal
          conn={conn}
          onClose={() => setDel(false)}
          onDeleted={() => onRemove(conn.id)}
        />
      )}
      <div className="px-4 py-3.5 hover:bg-muted/30 transition-colors group">
        <div className="flex items-start gap-3.5">
          {/* Status icon */}
          <div className="flex-shrink-0 mt-0.5 relative">
            {isLive ? (
              <>
                <Wifi className="w-4 h-4 text-success" />
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-success ring-2 ring-background animate-pulse" />
              </>
            ) : (
              <WifiOff className="w-4 h-4 text-muted-foreground" />
            )}
          </div>

          {/* Body */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-foreground truncate">
                {conn.machineName || truncateId(conn.id, 12)}
              </span>
              <Badge variant={isLive ? "green" : "gray"}>{isLive ? "Live" : "Offline"}</Badge>
              {conn.pluginVersion && (
                <span className="text-[11px] text-muted-foreground font-mono bg-muted px-1.5 py-px rounded">
                  v{conn.pluginVersion}
                </span>
              )}
            </div>

            <p className="text-xs text-muted-foreground mt-0.5">{lastSeenLabel}</p>

            {/* Agents */}
            {conn.agentSlugs.length > 0 && (
              <div className="mt-2">
                {conn.agentSlugs.length <= 3 ? (
                  <div className="flex flex-wrap gap-1">
                    {conn.agentSlugs.map((slug) => (
                      <span
                        key={slug}
                        className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted border border-border text-[11px] text-muted-foreground font-mono"
                      >
                        @{slug}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div>
                    <button
                      onClick={() => setExp((v) => !v)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {expanded ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                      {conn.agentSlugs.length} agents
                    </button>
                    {expanded && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {conn.agentSlugs.map((slug) => (
                          <span
                            key={slug}
                            className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted border border-border text-[11px] text-muted-foreground font-mono"
                          >
                            @{slug}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {conn.agentSlugs.length === 0 && (
              <p className="text-[11px] text-muted-foreground/60 mt-1 italic">
                No agents registered yet
              </p>
            )}
          </div>

          {/* Remove — only offline */}
          {!isLive && (
            <button
              onClick={() => setDel(true)}
              className="flex-shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
              title="Remove machine"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Devices panel ────────────────────────────────────────────────────────────

/** Status badge for a paired device. */
function DeviceStatusBadge({ status }: { status: string }) {
  if (status === "approved") return <Badge variant="green">Approved</Badge>;
  if (status === "revoked") return <Badge variant="gray">Revoked</Badge>;
  return <Badge variant="yellow">Pending</Badge>;
}

/**
 * Ed25519 device pairing (GAP-1). Admins approve or deny machines that paired by signing the
 * handshake nonce with their device key. A pending device cannot connect to the Live Gateway until
 * approved here. Covers loading / empty / error / success states.
 */
function DevicesPanel() {
  const [{ data, fetching, error }, refetch] = useQuery<{ liveGatewayDevices: Device[] }>({
    query: LIVE_GATEWAY_DEVICES_QUERY,
  });
  const [, approve] = useMutation(APPROVE_LIVE_GATEWAY_DEVICE);
  const [, revoke] = useMutation(REVOKE_LIVE_GATEWAY_DEVICE);
  const [busyId, setBusyId] = useState<string | null>(null);

  const devices = data?.liveGatewayDevices ?? [];

  async function handleApprove(id: string) {
    setBusyId(id);
    try {
      const res = await approve({ id });
      if (res.error) throw new Error(res.error.graphQLErrors?.[0]?.message ?? "Approve failed");
      toast.success("Device approved");
      refetch({ requestPolicy: "network-only" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to approve device");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRevoke(id: string) {
    setBusyId(id);
    try {
      const res = await revoke({ id });
      if (res.error) throw new Error(res.error.graphQLErrors?.[0]?.message ?? "Revoke failed");
      toast.success("Device access revoked");
      refetch({ requestPolicy: "network-only" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to revoke device");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Paired Devices</h2>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          Machines that pair by signing the handshake nonce with an Ed25519 device key. A new device
          registers as <strong>pending</strong> and cannot connect until an admin approves it here.
          The device key is pinned by machine fingerprint, so a leaked install token alone cannot
          impersonate an approved machine.
        </p>
      </div>

      {fetching ? (
        <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading devices…
        </div>
      ) : error ? (
        <p className="text-xs text-destructive py-2">
          Failed to load devices. {error.graphQLErrors?.[0]?.message ?? "Please refresh."}
        </p>
      ) : devices.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <ShieldCheck className="w-8 h-8 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">No paired devices yet.</p>
          <p className="text-[11px] text-muted-foreground/70">
            Configure a device key in the bridge plugin to pair a machine by its Ed25519 identity.
          </p>
        </div>
      ) : (
        <Card className="overflow-hidden divide-y divide-border">
          {devices.map((d) => {
            const busy = busyId === d.id;
            return (
              <div
                key={d.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors group"
              >
                <div className="w-7 h-7 rounded-lg bg-muted border border-border flex items-center justify-center flex-shrink-0">
                  <Monitor className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-semibold text-foreground truncate">
                      {d.label || truncateId(d.machineFingerprint, 16)}
                    </p>
                    <DeviceStatusBadge status={d.status} />
                  </div>
                  <p className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">
                    {truncateId(d.machineFingerprint, 24)}
                  </p>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {d.status === "approved" && d.approvedAt
                      ? `Approved ${relativeTime(d.approvedAt)}`
                      : d.lastSeenAt
                        ? `Last seen ${relativeTime(d.lastSeenAt)}`
                        : `Registered ${relativeTime(d.createdAt)}`}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {d.status === "pending" && (
                    <Button
                      variant="primary"
                      size="sm"
                      icon={busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                      disabled={busy}
                      onClick={() => handleApprove(d.id)}
                    >
                      Approve
                    </Button>
                  )}
                  {d.status !== "revoked" && (
                    <button
                      onClick={() => handleRevoke(d.id)}
                      disabled={busy}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                      title={d.status === "pending" ? "Deny device" : "Revoke device"}
                    >
                      {busy ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <X className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function LiveGatewayPage() {
  const [connections, setConnections] = useState<LiveConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("connections");
  const [showWizard, setShowWizard] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();

  // Auto-open wizard when navigated here with ?wizard=open
  useEffect(() => {
    if (searchParams.get("wizard") === "open") {
      setShowWizard(true);
      router.replace("/live-gateway");
    }
  }, [searchParams, router]);

  const fetchConnections = useCallback(async () => {
    try {
      const res = await fetch(API_ROUTES.liveGateway.connections);
      if (res.ok) setConnections((await res.json()).connections || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnections();
    const t = setInterval(fetchConnections, 15_000);
    return () => clearInterval(t);
  }, [fetchConnections]);

  function handleRemove(id: string) {
    setConnections((p) => p.filter((c) => c.id !== id));
  }

  const liveCount = connections.filter((c) => c.connectionStatus === "connected").length;
  const totalAgents = connections.reduce((s, c) => s + c.agentSlugs.length, 0);
  const existingIds = new Set(connections.map((c) => c.id));

  return (
    <PageLayout maxWidth="wide">
      {showWizard && (
        <SetupWizard
          onClose={() => setShowWizard(false)}
          onConnectionEstablished={fetchConnections}
          existingConnectionIds={existingIds}
        />
      )}

      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Live Gateway" }]} />

      <ErrorBoundary
        fallback={({ resetErrorBoundary, error }) => (
          <PanelErrorFallback label="Live Gateway" error={error} onRetry={resetErrorBoundary} />
        )}
      >
        {/* Page header */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2.5">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary/15">
                <Zap className="w-4 h-4 text-primary" />
              </span>
              Live Gateway
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
              Connect any machine running OpenClaw — tasks reach your agents in real time instead of
              waiting for the next heartbeat cycle.
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            icon={<Plus />}
            onClick={() => setShowWizard(true)}
            className="flex-shrink-0"
          >
            Connect machine
          </Button>
        </div>

        {/* How it works — shown only when no machines are connected yet */}
        {!loading && connections.length === 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            {[
              {
                icon: <Monitor className="w-4 h-4 text-primary" />,
                title: "Install the plugin",
                body: "Run one command on any machine where OpenClaw is running — PC, Mac, VM, server.",
              },
              {
                icon: <Zap className="w-4 h-4 text-primary" />,
                title: "Assign a task",
                body: "When you assign a task to an agent on that machine, it's delivered instantly — no waiting.",
              },
              {
                icon: <CheckCircle2 className="w-4 h-4 text-primary" />,
                title: "Agents get to work",
                body: "Your agents wake up and start working in seconds, not minutes.",
              },
            ].map(({ icon, title, body }) => (
              <Card key={title} className="p-4 space-y-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  {icon}
                </div>
                <p className="text-xs font-semibold text-foreground">{title}</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{body}</p>
              </Card>
            ))}
          </div>
        )}

        {/* Stats — only when machines exist */}
        {connections.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            {[
              { label: "Live now", value: liveCount, highlight: liveCount > 0 },
              { label: "Total machines", value: connections.length, highlight: false },
              { label: "Agents routed", value: totalAgents, highlight: false },
            ].map(({ label, value, highlight }) => (
              <Card key={label} className="p-4">
                <p className="text-xs text-muted-foreground mb-1.5">{label}</p>
                <p
                  className={`text-2xl font-bold tabular-nums ${highlight ? "text-success" : "text-foreground"}`}
                >
                  {value}
                </p>
              </Card>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-0.5 mb-5 border-b border-border">
          {(["connections", "tokens", "devices"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors rounded-t-md ${
                tab === t
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {t === "connections" ? (
                <Radio className="w-3.5 h-3.5" />
              ) : t === "tokens" ? (
                <Key className="w-3.5 h-3.5" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5" />
              )}
              {t === "connections" ? "Machines" : t === "tokens" ? "Setup Keys" : "Devices"}
              {t === "connections" && connections.length > 0 && (
                <span
                  className={`ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold ${
                    tab === t ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {connections.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tokens tab */}
        {tab === "tokens" && <TokenPanel />}

        {/* Devices tab */}
        {tab === "devices" && <DevicesPanel />}

        {/* Machines tab */}
        {tab === "connections" && (
          <>
            {loading ? (
              <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Loading machines…</span>
              </div>
            ) : connections.length === 0 ? (
              <EmptyState
                icon={<Monitor />}
                title="No machines connected"
                description="Connect any machine running OpenClaw — PC, Mac Mini, VM, or cloud server. Tasks assigned to its agents are delivered instantly."
                action={
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Plus />}
                    onClick={() => setShowWizard(true)}
                  >
                    Connect your first machine
                  </Button>
                }
              />
            ) : (
              <Card className="overflow-hidden divide-y divide-border">
                {connections.map((conn) => (
                  <ConnectionCard key={conn.id} conn={conn} onRemove={handleRemove} />
                ))}
              </Card>
            )}
          </>
        )}
      </ErrorBoundary>
    </PageLayout>
  );
}
