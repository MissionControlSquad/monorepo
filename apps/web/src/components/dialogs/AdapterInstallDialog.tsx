"use client";

import { useMutation } from "urql";
import { Input, Select, FormField, FormDialog } from "@/components/ui";
import { useResourceForm } from "@/hooks/useCrud";

const INSTALL_ADAPTER = `
  mutation ($type: String!, $displayName: String!, $transport: String, $authKind: String) {
    installAdapter(type: $type, displayName: $displayName, transport: $transport, authKind: $authKind) {
      type
    }
  }
`;

const TRANSPORTS = ["local", "gateway", "cloud"];
const AUTH_KINDS = ["none", "apiKey", "subscription", "secretBinding"];

interface AdapterInstallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

/** Register an external provider adapter into the registry (starts disabled). */
export function AdapterInstallDialog({ open, onOpenChange, onSaved }: AdapterInstallDialogProps) {
  const [, installAdapter] = useMutation(INSTALL_ADAPTER);
  const f = useResourceForm({
    open,
    onOpenChange,
    empty: { type: "", displayName: "", transport: "local", authKind: "apiKey" },
    submit: async (v) => {
      if (!v.type.trim() || !v.displayName.trim()) return "Type and display name are required";
      const res = await installAdapter({
        type: v.type.trim(),
        displayName: v.displayName.trim(),
        transport: v.transport,
        authKind: v.authKind,
      });
      return res.error?.graphQLErrors?.[0]?.message ?? res.error?.message ?? null;
    },
    onDone: onSaved,
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Register an external adapter"
      description="Adds the adapter to the registry so it can be enabled and assigned. It starts disabled."
      onSubmit={f.onSubmit}
      submitLabel="Install"
      busy={f.busy}
      error={f.error}
      submitDisabled={!f.values.type.trim() || !f.values.displayName.trim()}
    >
      <FormField label="Type">
        <Input placeholder="e.g. cursor-cloud" value={f.values.type} onChange={(e) => f.set("type", e.target.value)} />
      </FormField>
      <FormField label="Display name">
        <Input placeholder="e.g. Cursor (Cloud)" value={f.values.displayName} onChange={(e) => f.set("displayName", e.target.value)} />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Transport">
          <Select
            value={f.values.transport}
            onChange={(e) => f.set("transport", e.target.value)}
          >
            {TRANSPORTS.map((tr) => (
              <option key={tr} value={tr}>{tr}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Auth">
          <Select
            value={f.values.authKind}
            onChange={(e) => f.set("authKind", e.target.value)}
          >
            {AUTH_KINDS.map((ak) => (
              <option key={ak} value={ak}>{ak}</option>
            ))}
          </Select>
        </FormField>
      </div>
    </FormDialog>
  );
}
