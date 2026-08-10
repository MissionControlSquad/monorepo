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
import { JsonSchemaForm } from "@/components/common/JsonSchemaForm";
import { parseJsonSchema } from "@agentcenter/utils";

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
    () => (selectedAdapter ? parseJsonSchema(selectedAdapter.configSchema) : []),
    [selectedAdapter],
  );

  // Reset config to the stored value when switching back to the current adapter; clear otherwise.
  useEffect(() => {
    setConfig(selectedType === adapterType ? (adapterConfig ?? {}) : {});
  }, [selectedType, adapterType, adapterConfig]);

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
          <span className="block text-xs leading-snug text-muted-foreground">
            The runtime CLI this agent runs on (e.g. Claude Code, Codex). Pick the one installed on
            its environment — the connection settings below change to match.
          </span>
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
          <span className="block text-xs leading-snug text-muted-foreground">
            The model this agent uses for its work. Leave on the adapter default unless you need a
            specific one.
          </span>
        </label>
      </div>

      {fields.length > 0 && selectedAdapter && (
        <div className="border-t border-border pt-4">
          <JsonSchemaForm
            schema={selectedAdapter.configSchema}
            value={config}
            onChange={setConfig}
          />
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
