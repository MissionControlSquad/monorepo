"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { toast } from "sonner";
import {
  AI_RUNTIME_INVENTORY_QUERY,
  REPORTED_RUNTIME_INVENTORIES_QUERY,
} from "@/lib/graphql/queries";
import { INSTALL_RUNTIME_TOOL_VIA_RUNNER } from "@/lib/graphql/mutations";
import {
  AI_RUNTIME_TOOLS,
  NODE_PREREQ,
  installMethodsFor,
  needsNode as toolNeedsNode,
  RUNTIME_OSES,
  type RuntimeOs,
  type InstallMethod,
} from "@agentcenter/utils";
import { Button, Card, Badge, Spinner, Select } from "@/components/ui";
import { CopyButton } from "@/components/common/CopyButton";
import { CheckCircle2, Circle, ExternalLink, Download, ChevronDown, Terminal } from "lucide-react";

// AI Tools setup/doctor. For LOCAL (server) and any REMOTE runner that reported, show which AI CLIs are
// installed vs missing and hand copy-paste install help per OS. AI_TOOLS-gated (nav + server resolver);
// the install-via-runner action is admin + RUNNERS gated server-side. Install commands come from the
// pure researched catalog - never re-invented here.

const OS_LABEL: Record<RuntimeOs, string> = { macos: "macOS", linux: "Linux", windows: "Windows" };

interface ToolStatus {
  key: string;
  installed: boolean;
  version: string | null;
}
interface Inventory {
  os: string;
  nodeInstalled: boolean;
  nodeVersion: string | null;
  nodeDocsUrl: string;
  tools: ToolStatus[];
}
interface Reported {
  runnerId: string;
  runnerName: string | null;
  reportedAt: string;
  inventory: Inventory;
}

const LOCAL = "__local__";

function MethodBlock({ method }: { method: InstallMethod }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{method.label}</span>
          {method.kind === "recommended" && <Badge variant="green">recommended</Badge>}
          {method.needs === "node" && <Badge variant="yellow">needs Node.js</Badge>}
        </span>
        <CopyButton text={method.command} label="Copy" />
      </div>
      <div className="overflow-x-auto rounded bg-foreground/90 p-2">
        <code className="whitespace-pre font-mono text-xs text-background">{method.command}</code>
      </div>
      {method.note && <p className="text-xs text-muted-foreground">{method.note}</p>}
    </div>
  );
}

export default function AiToolsPage() {
  const [target, setTarget] = useState<string>(LOCAL);
  const [os, setOs] = useState<RuntimeOs | null>(null); // null = follow target's detected OS
  const [openAlts, setOpenAlts] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const [{ data: localData, fetching: localFetching, error: localError }] = useQuery<{
    aiRuntimeInventory: Inventory;
  }>({ query: AI_RUNTIME_INVENTORY_QUERY });
  const [{ data: remoteData }] = useQuery<{ reportedRuntimeInventories: Reported[] }>({
    query: REPORTED_RUNTIME_INVENTORIES_QUERY,
  });
  const [, installViaRunner] = useMutation(INSTALL_RUNTIME_TOOL_VIA_RUNNER);

  const reported = remoteData?.reportedRuntimeInventories ?? [];
  const selectedRemote = reported.find((r) => r.runnerId === target);
  const inventory: Inventory | undefined =
    target === LOCAL ? localData?.aiRuntimeInventory : selectedRemote?.inventory;

  // OS preview defaults to the target's detected OS; the toggle overrides it.
  const detectedOs = (inventory?.os as RuntimeOs) ?? "linux";
  const activeOs: RuntimeOs = os ?? detectedOs;
  const isRunnerTarget = target !== LOCAL;

  const statusByKey = new Map<string, ToolStatus>((inventory?.tools ?? []).map((t) => [t.key, t]));

  const nodeMissing = inventory ? !inventory.nodeInstalled : false;
  const nodeMethods = installMethodsFor(NODE_PREREQ, activeOs);

  async function onInstall(toolKey: string) {
    if (!isRunnerTarget) return;
    setBusy(toolKey);
    try {
      const res = await installViaRunner({ agentId: target, toolKey, os: activeOs });
      if (res.error) toast.error(res.error.graphQLErrors[0]?.message ?? "Failed to queue install");
      else toast.success("Install queued - the runner will pull it on its next poll");
    } finally {
      setBusy(null);
    }
  }

  if (localFetching && !localData) {
    return (
      <div className="flex justify-center p-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">AI Tools</h1>
        <p className="text-sm text-muted-foreground">
          Which AI coding CLIs are installed on each machine - and copy-paste help to install the
          ones that are missing. Commands are sourced from each tool&apos;s official docs.
        </p>
      </div>

      {localError && (
        <Card className="p-4 text-sm text-destructive">
          Could not detect tools: {localError.message}
        </Card>
      )}

      {/* Target + OS selectors */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block text-xs font-medium text-muted-foreground">Machine</span>
          <Select
            size="sm"
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              setOs(null); // snap back to the new target's detected OS
            }}
          >
            <option value={LOCAL}>This machine (server)</option>
            {reported.map((r) => (
              <option key={r.runnerId} value={r.runnerId}>
                {r.runnerName ?? `Runner ${r.runnerId.slice(0, 8)}`} ·{" "}
                {OS_LABEL[r.inventory.os as RuntimeOs] ?? r.inventory.os}
              </option>
            ))}
          </Select>
        </label>
        <div className="space-y-1">
          <span className="block text-xs font-medium text-muted-foreground">
            Show install steps for
          </span>
          <div className="inline-flex overflow-hidden rounded-md border border-border">
            {RUNTIME_OSES.map((o) => (
              <button
                key={o}
                onClick={() => setOs(o)}
                className={`px-3 py-1.5 text-xs transition ${
                  activeOs === o
                    ? "bg-foreground text-background"
                    : "bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {OS_LABEL[o]}
                {o === detectedOs && <span className="ml-1 opacity-60">·detected</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isRunnerTarget && selectedRemote && (
        <p className="text-xs text-muted-foreground">
          Reported {new Date(selectedRemote.reportedAt).toLocaleString()} · Install steps run on
          this runner when you click &quot;Install via runner&quot;.
        </p>
      )}

      {/* Node.js prerequisite */}
      {nodeMissing && (
        <Card className="space-y-2 border-yellow-500/40 p-4">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-yellow-600" />
            <h2 className="text-sm font-semibold text-foreground">Node.js is not installed</h2>
            <Badge variant="yellow">prerequisite</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Several CLIs install via npm and need Node.js first. Install it, then install the tool.
          </p>
          {nodeMethods[0] && <MethodBlock method={nodeMethods[0]} />}
          <a
            href={inventory?.nodeDocsUrl ?? NODE_PREREQ.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground underline hover:text-foreground"
          >
            Node.js docs <ExternalLink className="h-3 w-3" />
          </a>
        </Card>
      )}

      {!inventory && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No inventory reported for this machine yet.
        </Card>
      )}

      {/* Tool cards */}
      <div className="space-y-3">
        {inventory &&
          AI_RUNTIME_TOOLS.map((tool) => {
            const st = statusByKey.get(tool.key);
            const installed = st?.installed ?? false;
            const methods = installMethodsFor(tool, activeOs);
            const recommended = methods[0];
            const alternatives = methods.slice(1);
            const showsNodeFirst = toolNeedsNode(tool, activeOs) && nodeMissing;
            const altsOpen = openAlts[tool.key] ?? false;
            return (
              <Card key={tool.key} className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{tool.displayName}</span>
                      <code className="text-xs text-muted-foreground">{tool.binName}</code>
                    </div>
                    <p className="text-xs text-muted-foreground">{tool.summary}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {installed ? (
                      <Badge variant="green">
                        <CheckCircle2 className="mr-1 inline h-3 w-3" />
                        Installed{st?.version ? ` · ${st.version}` : ""}
                      </Badge>
                    ) : (
                      <Badge variant="gray">
                        <Circle className="mr-1 inline h-3 w-3" />
                        Not installed
                      </Badge>
                    )}
                    <a
                      href={tool.docsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground underline hover:text-foreground"
                    >
                      Docs <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>

                {!installed && (
                  <div className="space-y-3 border-t border-border pt-3">
                    {showsNodeFirst && (
                      <p className="text-xs text-yellow-600">
                        This path needs Node.js - install the prerequisite above first.
                      </p>
                    )}
                    {recommended ? (
                      <MethodBlock method={recommended} />
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No {OS_LABEL[activeOs]} install command for this tool.
                      </p>
                    )}

                    {alternatives.length > 0 && (
                      <div>
                        <button
                          onClick={() => setOpenAlts((m) => ({ ...m, [tool.key]: !altsOpen }))}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
                        >
                          <ChevronDown
                            className={`h-3 w-3 transition ${altsOpen ? "rotate-180" : ""}`}
                          />
                          {altsOpen ? "Hide" : "Show"} {alternatives.length} alternative
                          {alternatives.length > 1 ? "s" : ""}
                        </button>
                        {altsOpen && (
                          <div className="mt-2 space-y-3">
                            {alternatives.map((m, i) => (
                              <MethodBlock key={i} method={m} />
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {isRunnerTarget && recommended && (
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={busy === tool.key}
                        disabled={busy === tool.key}
                        onClick={() => onInstall(tool.key)}
                      >
                        <Download className="mr-1 h-3.5 w-3.5" />
                        Install via runner
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
      </div>
    </div>
  );
}
