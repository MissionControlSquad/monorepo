"use client";

import { useMutation } from "urql";
import { START_WORKSPACE_RUNTIME_SERVICE } from "@/lib/graphql/mutations";
import { Input, FormField, FormDialog, Select } from "@/components/ui";
import { useResourceForm } from "@/hooks/useCrud";

interface RuntimeServiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

/**
 * Start a long-lived runtime service (dev/preview process) inside an execution workspace. Reuse-by-key
 * means starting again with the same reuseKey re-attaches to the running service instead of duplicating.
 */
export function RuntimeServiceDialog({ open, onOpenChange, onSaved }: RuntimeServiceDialogProps) {
  const [, start] = useMutation(START_WORKSPACE_RUNTIME_SERVICE);
  const f = useResourceForm({
    open,
    onOpenChange,
    empty: {
      executionWorkspaceId: "",
      name: "",
      command: "",
      reuseKey: "",
      port: "",
      healthCheckUrl: "",
      stopPolicy: "on_run_end",
    },
    submit: async (v) => {
      if (!v.executionWorkspaceId.trim()) return "Execution workspace id is required";
      if (!v.name.trim()) return "Name is required";
      if (!v.command.trim()) return "Command is required";
      if (!v.reuseKey.trim()) return "Reuse key is required";
      const portNum = v.port.trim() ? Number(v.port) : null;
      if (portNum != null && (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535)) {
        return "Port must be an integer between 1 and 65535";
      }
      const r = await start({
        executionWorkspaceId: v.executionWorkspaceId.trim(),
        name: v.name.trim(),
        command: v.command.trim(),
        reuseKey: v.reuseKey.trim(),
        port: portNum,
        healthCheckUrl: v.healthCheckUrl.trim() || null,
        stopPolicy: v.stopPolicy,
      });
      return r.error?.message ?? null;
    },
    onDone: onSaved,
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Start runtime service"
      description="Start a long-lived process (e.g. a dev server) inside an execution workspace."
      onSubmit={f.onSubmit}
      submitLabel="Start"
      busy={f.busy}
      error={f.error}
      submitDisabled={
        !f.values.executionWorkspaceId.trim() ||
        !f.values.name.trim() ||
        !f.values.command.trim() ||
        !f.values.reuseKey.trim()
      }
    >
      <FormField
        label="Execution workspace id"
        hint="The ExecutionWorkspace the process runs inside."
      >
        <Input
          placeholder="e.g. clx… (the ExecutionWorkspace to run inside)"
          value={f.values.executionWorkspaceId}
          onChange={(e) => f.set("executionWorkspaceId", e.target.value)}
        />
      </FormField>
      <FormField label="Name">
        <Input
          placeholder="e.g. Vite dev server"
          value={f.values.name}
          onChange={(e) => f.set("name", e.target.value)}
        />
      </FormField>
      <FormField label="Command" hint="The launch command a runner would exec.">
        <Input
          placeholder="e.g. npm run dev"
          value={f.values.command}
          onChange={(e) => f.set("command", e.target.value)}
        />
      </FormField>
      <FormField
        label="Reuse key"
        hint="Stable dedupe key. Starting again with the same reuse key re-attaches to the running service instead of spawning a duplicate."
      >
        <Input
          placeholder="e.g. dev"
          value={f.values.reuseKey}
          onChange={(e) => f.set("reuseKey", e.target.value)}
        />
      </FormField>
      <FormField label="Port (optional)">
        <Input
          placeholder="e.g. 5173"
          inputMode="numeric"
          value={f.values.port}
          onChange={(e) => f.set("port", e.target.value)}
        />
      </FormField>
      <FormField label="Health check URL (optional)" hint="A runner probes this for liveness.">
        <Input
          placeholder="e.g. http://localhost:5173/health"
          value={f.values.healthCheckUrl}
          onChange={(e) => f.set("healthCheckUrl", e.target.value)}
        />
      </FormField>
      <FormField
        label="Stop policy"
        hint="on_run_end: stops when the run that started it ends. on_idle: reaped when the workspace goes idle. manual: only ever stopped by hand."
      >
        <Select value={f.values.stopPolicy} onChange={(e) => f.set("stopPolicy", e.target.value)}>
          <option value="on_run_end">on_run_end — stop when the run ends</option>
          <option value="on_idle">on_idle — reap when idle</option>
          <option value="manual">manual — stop by hand only</option>
        </Select>
      </FormField>
    </FormDialog>
  );
}
