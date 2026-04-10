"use client";

import { useState } from "react";
import { Loader2, MonitorDown, CircleCheck, CircleX, SkipForward } from "lucide-react";
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

function stepIcon(status: StepStatus) {
  if (status === "success") return <CircleCheck className="w-4 h-4 text-success flex-shrink-0" />;
  if (status === "failed") return <CircleX className="w-4 h-4 text-destructive flex-shrink-0" />;
  return <SkipForward className="w-4 h-4 text-muted-foreground flex-shrink-0" />;
}

export function DesktopBootstrapButton({
  payload,
  onComplete,
}: {
  payload: DesktopBootstrapPayload;
  onComplete?: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<BootstrapStep[] | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  async function handleBootstrap() {
    const api = window.electronAPI;
    if (!api) return;

    setRunning(true);
    setSteps(null);
    setSucceeded(false);

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
      setRunning(false);
    }
  }

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
        <Button onClick={handleBootstrap} disabled={running} className="w-full">
          {running ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <MonitorDown className="w-4 h-4" />
          )}
          {running ? "Setting up agent…" : "Bootstrap with Desktop App"}
        </Button>
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
