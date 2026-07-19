"use client";

// JsonSchemaForm (keystone #3, Paperclip parity) — reusable schema-driven config form. Renders a
// draft-07 object JSON Schema into fields via the shared pure model (@agentcenter/utils), and surfaces
// validation. Controlled: parents own `value` and get `onChange`. Consumers: adapter config
// (AgentAdapterConfigCard), and — behind their existing flags — environments / plugins / secrets.
//
// Secret handling: `secret` fields render masked (password); `secretRef` fields bind a vault pointer
// shaped `{ secretRef: { name } }` (the repo convention). A full secret-picker is deferred to the
// env-var editor item; here a secret-name input is enough to produce the pointer.

import { useMemo } from "react";
import {
  parseJsonSchema,
  validateJsonSchemaForm,
  type JsonSchemaFormField,
  type JsonSchemaFormError,
} from "@agentcenter/utils";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/shadcn/input";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { Switch } from "@/components/ui/shadcn/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";

export interface JsonSchemaFormProps {
  schema: unknown;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  /** Server-side (or externally computed) errors, keyed by field. Merged with client validation. */
  errors?: JsonSchemaFormError[];
  /** Show client-side validation inline as the user edits (default true). */
  validate?: boolean;
  disabled?: boolean;
  className?: string;
}

function secretRefName(value: unknown): string {
  const rec = value as { secretRef?: { name?: string } } | null | undefined;
  return rec?.secretRef?.name ?? "";
}

/** Pure helper other callers can reuse: is the whole form currently valid? */
export function isJsonSchemaFormValid(schema: unknown, value: Record<string, unknown>): boolean {
  return validateJsonSchemaForm(schema, value).length === 0;
}

export function JsonSchemaForm({
  schema,
  value,
  onChange,
  errors,
  validate = true,
  disabled,
  className,
}: JsonSchemaFormProps) {
  const fields = useMemo(() => parseJsonSchema(schema), [schema]);
  const clientErrors = useMemo(
    () => (validate ? validateJsonSchemaForm(schema, value) : []),
    [validate, schema, value],
  );

  const errorByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of [...clientErrors, ...(errors ?? [])]) {
      if (!map.has(e.key)) map.set(e.key, e.message);
    }
    return map;
  }, [clientErrors, errors]);

  if (fields.length === 0) return null;

  function setField(key: string, next: unknown) {
    const updated = { ...value };
    if (next === undefined) delete updated[key];
    else updated[key] = next;
    onChange(updated);
  }

  function renderControl(f: JsonSchemaFormField) {
    const err = errorByKey.get(f.key);

    if (f.type === "boolean") {
      return (
        <Switch
          checked={Boolean(value[f.key] ?? f.default ?? false)}
          onCheckedChange={(v) => setField(f.key, v)}
          disabled={disabled}
        />
      );
    }

    if (f.type === "enum") {
      return (
        <Select
          value={String(value[f.key] ?? f.default ?? "")}
          onValueChange={(v) => setField(f.key, v)}
          disabled={disabled}
        >
          <SelectTrigger className="w-full" aria-invalid={!!err}>
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {f.enumValues?.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (f.secretRef) {
      const name = secretRefName(value[f.key]);
      return (
        <Input
          value={name}
          placeholder={f.placeholder ?? "secret name"}
          aria-invalid={!!err}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            setField(f.key, v ? { secretRef: { name: v } } : undefined);
          }}
        />
      );
    }

    // long free-text (maxLength > 120) → textarea; everything else is a single-line input
    if (!f.secret && f.maxLength !== undefined && f.maxLength > 120) {
      return (
        <Textarea
          value={String(value[f.key] ?? "")}
          placeholder={f.placeholder}
          aria-invalid={!!err}
          disabled={disabled}
          onChange={(e) => setField(f.key, e.target.value || undefined)}
        />
      );
    }

    return (
      <Input
        type={f.secret ? "password" : f.type === "number" ? "number" : "text"}
        value={String(value[f.key] ?? "")}
        placeholder={f.placeholder ?? (f.default !== undefined ? String(f.default) : undefined)}
        aria-invalid={!!err}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value;
          if (f.type === "number") {
            setField(f.key, raw === "" ? undefined : Number(raw));
          } else {
            setField(f.key, raw === "" ? undefined : raw);
          }
        }}
      />
    );
  }

  return (
    <div className={className ?? "space-y-3"}>
      {fields.map((f) => {
        const err = errorByKey.get(f.key);
        return (
          <FormField key={f.key} label={f.label} required={f.required}>
            {renderControl(f)}
            {f.description && !err && (
              <p className="text-xs text-muted-foreground">{f.description}</p>
            )}
            {err && <p className="text-xs text-destructive">{err}</p>}
          </FormField>
        );
      })}
    </div>
  );
}
