"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "urql";
import { toast } from "sonner";
import { Card, Button } from "../ui";
import { Input } from "@/components/ui/shadcn/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import { UPDATE_AGENT_PROFILE } from "@agentcenter/graphql-client/mutations/agents";
import { adapterConfigFields } from "@agentcenter/utils";

// Epic #2: per-agent adapter + model + config editor. Wires the staged Agent.adapterType/adapterConfig/
// llmModel columns into an editable surface (Paperclip AgentConfigForm parity). The config fields are
// rendered from the adapter's JSON Schema via the shared adapterConfigFields helper; the server
// re-validates on setAgentAdapter.

const ADAPTERS_QUERY = `
  query {
    agentAdapters(enabledOnly: true) {
      type
      displayName
      configSchema
    }
  }
`;

const MODEL_PROFILES_QUERY = `
  query ($adapterType: String!) {
    adapterModelProfiles(adapterType: $adapterType) {
      modelId
      displayName
      isDefault
    }
  }
`;

const SET_AGENT_ADAPTER = `
  mutation ($agentId: String!, $adapterType: String!, $adapterConfig: JSON) {
    setAgentAdapter(agentId: $agentId, adapterType: $adapterType, adapterConfig: $adapterConfig) {
      id
      adapterType
      adapterConfig
    }
  }
`;

interface AdapterOption {
  type: string;
  displayName: string;
  configSchema: unknown;
}
interface ModelProfile {
  modelId: string;
  displayName: string;
  isDefault: boolean;
}

export function AgentAdapterConfigCard({
  agentId,
  adapterType,
  adapterConfig,
  llmModel,
}: {
  agentId: string;
  adapterType: string | null;
  adapterConfig: Record<string, unknown> | null;
  llmModel: string | null;
}) {
  const [{ data: adaptersData }] = useQuery<{ agentAdapters: AdapterOption[] }>({
    query: ADAPTERS_QUERY,
  });
  const adapters = useMemo(() => adaptersData?.agentAdapters ?? [], [adaptersData]);

  const [selectedType, setSelectedType] = useState<string>(adapterType ?? "");
  const [config, setConfig] = useState<Record<string, unknown>>(adapterConfig ?? {});
  const [model, setModel] = useState<string>(llmModel ?? "");
  const [saving, setSaving] = useState(false);

  const [{ data: modelsData }] = useQuery<{ adapterModelProfiles: ModelProfile[] }>({
    query: MODEL_PROFILES_QUERY,
    variables: { adapterType: selectedType },
    pause: !selectedType,
  });
  const models = useMemo(() => modelsData?.adapterModelProfiles ?? [], [modelsData]);

  const [, setAgentAdapter] = useMutation(SET_AGENT_ADAPTER);
  const [, updateProfile] = useMutation(UPDATE_AGENT_PROFILE);

  const selectedAdapter = adapters.find((a) => a.type === selectedType);
  const fields = useMemo(
    () => (selectedAdapter ? adapterConfigFields(selectedAdapter.configSchema) : []),
    [selectedAdapter],
  );

  // Reset config to the stored value when switching back to the current adapter; clear otherwise.
  useEffect(() => {
    setConfig(selectedType === adapterType ? (adapterConfig ?? {}) : {});
  }, [selectedType, adapterType, adapterConfig]);

  function setField(key: string, value: unknown) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  async function save() {
    if (!selectedType) {
      toast.error("Select an adapter");
      return;
    }
    setSaving(true);
    try {
      const res = await setAgentAdapter({
        agentId,
        adapterType: selectedType,
        adapterConfig: config,
      });
      if (res.error) {
        toast.error(res.error.message.replace("[GraphQL] ", ""));
        return;
      }
      const modelRes = await updateProfile({ id: agentId, llmModel: model });
      if (modelRes.error) {
        toast.error("Adapter saved but model update failed");
        return;
      }
      toast.success("Adapter configuration saved");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding="lg" className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Adapter &amp; Model</h2>
        <p className="text-xs text-muted-foreground">
          Which provider runtime this agent runs on, and its model + connection settings.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-sm font-medium text-foreground">Adapter</span>
          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select an adapter" />
            </SelectTrigger>
            <SelectContent>
              {adapters.map((a) => (
                <SelectItem key={a.type} value={a.type}>
                  {a.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium text-foreground">Model</span>
          {models.length > 0 ? (
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Adapter default" />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m.modelId} value={m.modelId}>
                    {m.displayName}
                    {m.isDefault ? " (default)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Adapter default"
            />
          )}
        </label>
      </div>

      {fields.length > 0 && (
        <div className="space-y-3 border-t border-border pt-4">
          {fields.map((f) => (
            <label key={f.key} className="block space-y-1">
              <span className="text-sm font-medium text-foreground">
                {f.label}
                {f.required && <span className="text-destructive"> *</span>}
              </span>
              {f.type === "boolean" ? (
                <input
                  type="checkbox"
                  checked={Boolean(config[f.key] ?? f.default ?? false)}
                  onChange={(e) => setField(f.key, e.target.checked)}
                  className="ml-1 h-4 w-4"
                />
              ) : f.type === "enum" ? (
                <Select
                  value={String(config[f.key] ?? f.default ?? "")}
                  onValueChange={(v) => setField(f.key, v)}
                >
                  <SelectTrigger className="w-full">
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
              ) : (
                <Input
                  type={f.secret ? "password" : f.type === "number" ? "number" : "text"}
                  value={String(config[f.key] ?? "")}
                  placeholder={f.default !== undefined ? String(f.default) : undefined}
                  onChange={(e) =>
                    setField(
                      f.key,
                      f.type === "number"
                        ? e.target.value === ""
                          ? undefined
                          : Number(e.target.value)
                        : e.target.value,
                    )
                  }
                />
              )}
              {f.description && (
                <span className="text-xs text-muted-foreground">{f.description}</span>
              )}
            </label>
          ))}
        </div>
      )}

      <div className="flex justify-end border-t border-border pt-4">
        <Button onClick={save} loading={saving} disabled={saving || !selectedType}>
          Save adapter config
        </Button>
      </div>
    </Card>
  );
}
