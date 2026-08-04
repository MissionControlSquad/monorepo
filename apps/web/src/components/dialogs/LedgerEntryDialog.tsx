"use client";

import { useMutation } from "urql";
import { CREATE_LEDGER_EVENT } from "@/lib/graphql/mutations";
import { Input, Select, FormField, FormDialog } from "@/components/ui";
import { useResourceForm } from "@/hooks/useCrud";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

interface LedgerEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

/** Record a business ledger entry (revenue/expense). */
export function LedgerEntryDialog({ open, onOpenChange, onSaved }: LedgerEntryDialogProps) {
  const [, createEvent] = useMutation(CREATE_LEDGER_EVENT);
  const f = useResourceForm({
    open,
    onOpenChange,
    empty: { kind: "expense", category: "", biller: "", amount: "", date: todayISO(), description: "" },
    submit: async (v) => {
      const amountCents = Math.round(Number(v.amount) * 100);
      if (!v.category.trim()) return "Category is required";
      if (!Number.isFinite(amountCents) || amountCents <= 0) return "Enter a positive amount";
      const res = await createEvent({
        kind: v.kind,
        category: v.category.trim(),
        biller: v.biller.trim() || null,
        amountCents,
        description: v.description.trim() || null,
        occurredAt: new Date(v.date + "T00:00:00.000Z").toISOString(),
      });
      return res.error?.graphQLErrors?.[0]?.message ?? res.error?.message ?? null;
    },
    onDone: onSaved,
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record a ledger entry"
      onSubmit={f.onSubmit}
      submitLabel="Add entry"
      busy={f.busy}
      error={f.error}
      submitDisabled={!f.values.category.trim() || !f.values.amount.trim()}
    >
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Kind">
          <Select
            value={f.values.kind}
            onChange={(e) => f.set("kind", e.target.value)}
          >
            <option value="revenue">revenue</option>
            <option value="expense">expense</option>
          </Select>
        </FormField>
        <FormField label="Amount ($)">
          <Input inputMode="decimal" placeholder="0.00" value={f.values.amount} onChange={(e) => f.set("amount", e.target.value)} />
        </FormField>
      </div>
      <FormField label="Category">
        <Input placeholder="e.g. Hosting" value={f.values.category} onChange={(e) => f.set("category", e.target.value)} />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Biller / vendor (optional)">
          <Input value={f.values.biller} onChange={(e) => f.set("biller", e.target.value)} />
        </FormField>
        <FormField label="Date">
          <Input type="date" value={f.values.date} onChange={(e) => f.set("date", e.target.value)} />
        </FormField>
      </div>
      <FormField label="Description (optional)">
        <Input value={f.values.description} onChange={(e) => f.set("description", e.target.value)} />
      </FormField>
    </FormDialog>
  );
}
