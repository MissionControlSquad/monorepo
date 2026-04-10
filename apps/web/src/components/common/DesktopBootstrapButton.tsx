"use client";

import { useState, useRef } from "react";
import {
  Loader2,
  MonitorDown,
  CircleCheck,
  CircleX,
  SkipForward,
  Download,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui";
import { type BootstrapStep } from "@agentcenter/hooks/browser";
import type { AgentConfigFile } from "@agentcenter/utils";

export interface DesktopBootstrapPayload {
  agentId: string;
  agentName: string;
  workspacePath: string;
  configFiles: AgentConfigFile[];
  requiredClis: string[];
  cronSchedule: string;
  cronMessage: string;
}

type StepStatus = "success" | "failed" | "skipped";
type InstallPhase = "idle" | "nvm" | "openclaw";

function stepIcon(status: StepStatus) {
  if (status === "success") return <CircleCheck className="w-4 h-4 text-success flex-shrink-0" />;
  if (status === "failed") return <CircleX className="w-4 h-4 text-destructive flex-shrink-0" />;
  return <SkipForward className="w-4 h-4 text-muted-foreground flex-shrink-0" />;
}

function isOpenClawMissing(steps: BootstrapStep[]): boolean {
  return steps.some(
    (s) =>
      s.name.includes("Verify required CLIs") &&
      s.status === "failed" &&
      (s.error?.toLowerCase().includes("openclaw") ?? false),
  );
}

function isNpmMissing(error: string): boolean {
  return error.toLowerCase().includes("npm not found");
}

export function DesktopBootstrapButton({
  payload,
  onComplete,
}: {
  payload: DesktopBootstrapPayload;
  onComplete?: () => void;
}) {
  const [bootstrapRunning, setBootstrapRunning] = useState(false);
  const [bootstrapStatus, setBootstrapStatus] = useState<string | null>(null);
  const [steps, setSteps] = useState<BootstrapStep[] | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  // Install state (covers both nvm + openclaw phases)
  const [installPhase, setInstallPhase] = useState<InstallPhase>("idle");
  const [installLog, setInstallLog] = useState("");
  const [installError, setInstallError] = useState<string | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // ── Helpers ────────────────────────────────────────────────────────

  function startProgressListener() {
    const api = window.electronAPI!;
    unsubscribeRef.current?.();
    unsubscribeRef.current = api.onInstallProgress((chunk: string) => {
      setInstallLog((prev) => prev + chunk);
    });
  }

  function stopProgressListener() {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
  }

  async function runBootstrap() {
    const api = window.electronAPI;
    if (!api) return;

    setBootstrapRunning(true);
    setBootstrapStatus(null);
    setSteps(null);
    setSucceeded(false);

    const unsubStatus = api.onBootstrapStatus((msg: string) => setBootstrapStatus(msg));

    try {
      const result = await api.bootstrapAgent({
        agentId: payload.agentId,
        agentName: payload.agentName,
        workspacePath: payload.workspacePath,
        configFiles: payload.configFiles,
        requiredClis: payload.requiredClis,
        cronSchedule: payload.cronSchedule,
        cronMessage: payload.cronMessage,
        triggerImmediately: true,
      });
      setSteps(result.steps);
      setSucceeded(result.success);
      if (result.success) onComplete?.();
    } catch (err) {
      setSteps([
        {
          name: "Bootstrap",
          status: "failed",
          error: err instanceof Error ? err.message : "Unknown error",
        },
      ]);
    } finally {
      unsubStatus();
      setBootstrapStatus(null);
      setBootstrapRunning(false);
    }
  }

  async function installOpenclaw() {
    const api = window.electronAPI;
    if (!api) return;

    setInstallPhase("openclaw");
    setInstallLog("");
    setInstallError(null);
    startProgressListener();

    try {
      const result = await api.installOpenclaw();
      stopProgressListener();

      if (result.success) {
        // openclaw installed — run bootstrap automatically
        setInstallPhase("idle");
        setInstallLog("");
        setSteps(null);
        await runBootstrap();
      } else {
        setInstallError(result.error ?? "Install failed.");
      }
    } catch (err) {
      stopProgressListener();
      setInstallError(err instanceof Error ? err.message : "Unknown error");
    }
  }

  async function installNvm() {
    const api = window.electronAPI;
    if (!api) return;

    setInstallPhase("nvm");
    setInstallLog("");
    setInstallError(null);
    startProgressListener();

    try {
      const result = await api.installNvm();
      stopProgressListener();

      if (result.success) {
        // nvm + node installed — continue straight to openclaw install
        await installOpenclaw();
      } else {
        setInstallError(result.error ?? "nvm install failed.");
      }
    } catch (err) {
      stopProgressListener();
      setInstallError(err instanceof Error ? err.message : "Unknown error");
    }
  }

  // ── Install panel (nvm or openclaw) ───────────────────────────────
  if (installPhase !== "idle" || installError) {
    const isNvmPhase = installPhase === "nvm";
    const isOpenClawPhase = installPhase === "openclaw";
    const isRunning = isNvmPhase || isOpenClawPhase;
    const showNvmRetry = installError && isNpmMissing(installError);

    const title = isNvmPhase
      ? "Installing NVM + Node.js"
      : isOpenClawPhase
        ? "Installing OpenClaw"
        : installError && isNpmMissing(installError)
          ? "Node.js / npm not found"
          : "OpenClaw install failed";

    const subtitle = isNvmPhase ? (
      "Installing nvm and the latest LTS Node.js release…"
    ) : isOpenClawPhase ? (
      <>
        Running{" "}
        <code className="font-mono text-xs bg-blue-100 px-1 rounded">
          npm install -g openclaw@latest
        </code>
        …
      </>
    ) : null;

    return (
      <div className="border border-blue-200 bg-blue-50 rounded-xl p-5 space-y-4">
        <div className="flex items-start gap-3">
          {isNvmPhase ? (
            <Package className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          ) : (
            <Download className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <h3 className="font-semibold text-blue-800 mb-1">{title}</h3>
            {subtitle && <p className="text-sm text-blue-700">{subtitle}</p>}
          </div>
        </div>

        {/* Live log output */}
        {installLog && (
          <pre className="text-xs bg-gray-900 text-gray-100 rounded-lg p-3 max-h-52 overflow-y-auto whitespace-pre-wrap break-all font-mono leading-relaxed">
            {installLog}
          </pre>
        )}

        {isRunning && (
          <div className="flex items-center gap-2 text-sm text-blue-700">
            <Loader2 className="w-4 h-4 animate-spin" />
            {isNvmPhase ? "Installing nvm + Node.js…" : "Installing openclaw…"}
          </div>
        )}

        {installError && (
          <div className="space-y-3">
            <p className="text-sm text-destructive font-medium">
              {showNvmRetry ? "npm / Node.js is not installed." : "Installation failed"}
            </p>
            <pre className="text-xs text-destructive whitespace-pre-wrap break-all">
              {installError}
            </pre>
            <div className="flex gap-2">
              {showNvmRetry ? (
                <Button onClick={installNvm} className="flex-1">
                  <Package className="w-4 h-4" />
                  Install NVM + Node.js &amp; Continue
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setInstallError(null);
                    setInstallLog("");
                    setInstallPhase("idle");
                  }}
                >
                  Back
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Main bootstrap panel ──────────────────────────────────────────
  return (
    <div className="border border-blue-200 bg-blue-50 rounded-xl p-5 space-y-4">
      <div className="flex items-start gap-3">
        <MonitorDown className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-semibold text-blue-800 mb-1">One-Click Desktop Bootstrap</h3>
          <p className="text-sm text-blue-700">
            The desktop app will write config files, register the agent, and schedule the heartbeat
            cron — no terminal required.
          </p>
        </div>
      </div>

      {!steps && (
        <div className="space-y-2">
          <Button onClick={runBootstrap} disabled={bootstrapRunning} className="w-full">
            {bootstrapRunning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <MonitorDown className="w-4 h-4" />
            )}
            {bootstrapRunning ? "Setting up agent…" : "Bootstrap with Desktop App"}
          </Button>
          {bootstrapRunning && bootstrapStatus && (
            <p className="text-xs text-blue-600 text-center animate-pulse">{bootstrapStatus}</p>
          )}
        </div>
      )}

      {steps && (
        <div className="space-y-2">
          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              {stepIcon(step.status as StepStatus)}
              <div className="flex-1 min-w-0">
                <span
                  className={
                    step.status === "failed"
                      ? "text-destructive font-medium"
                      : step.status === "skipped"
                        ? "text-muted-foreground"
                        : "text-foreground"
                  }
                >
                  {step.name}
                </span>
                {step.error && (
                  <p className="text-xs text-destructive mt-0.5 break-all">{step.error}</p>
                )}
                {step.output && step.status !== "success" && (
                  <pre className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap break-all">
                    {step.output}
                  </pre>
                )}
              </div>
            </div>
          ))}

          {succeeded ? (
            <p className="text-sm text-success font-medium pt-1">
              Agent is setting up — first heartbeat will fire on its scheduled cron.
            </p>
          ) : isOpenClawMissing(steps) ? (
            <div className="pt-1 space-y-2">
              <p className="text-sm text-amber-700 font-medium">
                OpenClaw is not installed. Install it now?
              </p>
              <Button onClick={installOpenclaw} className="w-full">
                <Download className="w-4 h-4" />
                Install OpenClaw &amp; Continue
              </Button>
            </div>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSteps(null);
                setSucceeded(false);
              }}
              className="mt-2"
            >
              Retry
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
