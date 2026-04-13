"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "urql";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  AlertTriangle,
  Terminal,
  ShieldAlert,
  Archive,
  Send,
  Wrench,
  MessageSquare,
  Star,
  Bot,
  Eye,
  EyeOff,
  Cloud,
  Server,
  MonitorDown,
} from "lucide-react";
import { AGENTS_QUERY } from "../lib/graphql/queries";
import { Roles, SetupStatus, AgentLevel, CloudVmStatus, Priority } from "@/server/constants";
import { CREATE_TASK_FROM_DASHBOARD } from "../lib/graphql/mutations/tasks";
import { Button, Badge } from "../components/ui";
import { useFeatureFlag } from "../components/context/FeatureFlagContext";
import { FLAG_KEYS } from "@agentcenter/utils";
import { CopyButton } from "../components/common/CopyButton";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from "@/components/ui/shadcn/form";
import { Input as ShadcnInput } from "@/components/ui/shadcn/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import { useAgentStatus } from "../components/context/AgentStatusContext";
import { MentionTextArea } from "../components/common/MentionTextArea";
import { useMentionData, useMentionSuggestions } from "../components/context/MentionDataContext";
import {
  TEMPLATES,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  type WizardTemplate as Template,
} from "../lib/agent-wizard-templates";
import { type SetupMode, type AgentConfigFile, type AgentSetupResult } from "@agentcenter/utils";
import { useIsElectron } from "@agentcenter/hooks/browser";
import { DesktopBootstrapButton } from "@/components/common/DesktopBootstrapButton";
import { createZipBlob } from "../lib/createZipBlob";

type Step = "template" | "details" | "setup";

function DownloadButton({ filename, content }: { filename: string; content: string }) {
  return (
    <Button
      variant="ghost"
      size="xs"
      onClick={() => {
        const blob = new Blob([content], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }}
      className="bg-muted"
    >
      <Download className="w-3 h-3" />
      Download
    </Button>
  );
}

function DownloadZipButton({ files, zipName }: { files: AgentConfigFile[]; zipName: string }) {
  return (
    <Button
      icon={<Archive className="w-4 h-4" />}
      onClick={() => {
        const blob = createZipBlob(files.map((f) => ({ name: f.filename, content: f.content })));
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = zipName;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("ZIP downloaded");
      }}
    >
      Download All as ZIP
    </Button>
  );
}

const agentWizardSchema = z.object({
  name: z.string().min(1, "Name is required"),
  username: z.string().optional(),
  role: z.string().min(1, "Role is required"),
  emoji: z.string().optional(),
  personality: z.string().optional(),
  level: z.string(),
  workspacePath: z.string().optional(),
});

type AgentWizardValues = z.infer<typeof agentWizardSchema>;

const INITIAL_FORM: AgentWizardValues = {
  name: "",
  username: "",
  role: "",
  emoji: "",
  personality: "",
  level: AgentLevel.SPECIALIST,
  workspacePath: "",
};

export function NewAgentWizard() {
  const router = useRouter();
  const { refetchAgents } = useAgentStatus();
  const [step, setStep] = useState<Step>("template");
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [result, setResult] = useState<AgentSetupResult | null>(null);
  const [agentsResult] = useQuery({ query: AGENTS_QUERY });
  const squadLeads =
    agentsResult.data?.agents?.filter(
      (a: { role?: string; setupStatus?: string }) =>
        a.role === Roles.SQUAD_LEAD && a.setupStatus !== SetupStatus.DEACTIVATED,
    ) ?? [];
  const hasSquadLead = squadLeads.length > 0;
  const cloudVmsEnabled = useFeatureFlag(FLAG_KEYS.CLOUD_VMS);
  const isDesktopApp = useIsElectron();

  // Auto-switch to the Desktop App tab once isDesktopApp resolves after hydration.
  useEffect(() => {
    if (isDesktopApp) setSetupMode("desktop");
  }, [isDesktopApp]);

  // Form fields with zod validation
  const form = useForm<AgentWizardValues>({
    resolver: zodResolver(agentWizardSchema),
    defaultValues: INITIAL_FORM,
  });
  const [setupMode, setSetupMode] = useState<SetupMode>("auto");
  const [showApiKey, setShowApiKey] = useState(false);
  const [delegateStatus, setDelegateStatus] = useState<"idle" | "creating" | "created">("idle");
  const [delegateTaskNumber, setDelegateTaskNumber] = useState<number | null>(null);
  const [cloudDeploying, setCloudDeploying] = useState(false);
  const [cloudVmId, setCloudVmId] = useState<string | null>(null);
  const [existingVMs, setExistingVMs] = useState<
    Array<{
      id: string;
      name?: string | null;
      serverName?: string | null;
      status: string;
      ipv4?: string | null;
      region: string;
      serverType: string;
      llmConfigured?: boolean;
    }>
  >([]);
  const [selectedVmId, setSelectedVmId] = useState<string>("");
  const [vmListLoading, setVmListLoading] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<Template>(TEMPLATES[0]);
  const [, createTask] = useMutation(CREATE_TASK_FROM_DASHBOARD);
  const mentionSuggestionSources = useMentionSuggestions();
  const { profileById, agentById, taskById, projectById } = useMentionData();
  const mentionMaps = useMemo(
    () => ({ profileById, agentById, taskById, projectById }),
    [profileById, agentById, taskById, projectById],
  );

  const selectTemplate = useCallback(
    (t: Template) => {
      setSelectedTemplate(t);
      if (t.id !== "blank") {
        form.reset({
          ...INITIAL_FORM,
          role: t.role ?? "",
          emoji: t.emoji ?? "",
          personality: t.personality ?? "",
          level: t.level ?? AgentLevel.SPECIALIST,
        });
      } else {
        form.reset(INITIAL_FORM);
      }
      setStep("details");
    },
    [form],
  );

  const handleCreate = useCallback(
    async (values: AgentWizardValues) => {
      setIsCreating(true);
      try {
        const res = await fetch("/api/agents/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: values.name,
            role: values.role,
            username:
              values.username ||
              values.name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, ""),
            identityEmoji: values.emoji || "🤖",
            personality: values.personality,
            level: values.level,
            templateId: selectedTemplate?.id,
            workspacePath: values.workspacePath || undefined,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          toast.error(data.error || "Failed to create agent");
          setIsCreating(false);
          return;
        }

        const data = await res.json();
        setResult(data);
        setStep("setup");
        refetchAgents();
      } catch {
        toast.error("Failed to create agent");
      } finally {
        setIsCreating(false);
      }
    },
    [selectedTemplate, refetchAgents],
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className={`${step === "template" ? "max-w-5xl" : "max-w-4xl"} mx-auto px-4 py-8`}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (step === "details") setStep("template");
              else if (step === "setup") router.push("/agents");
              else router.push("/agents");
            }}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground">Create Agent</h1>
            <p className="text-sm text-muted-foreground">
              {step === "template" && "Choose a template to get started"}
              {step === "details" && "Configure your agent"}
              {step === "setup" && "Setup instructions"}
            </p>
          </div>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-2 mb-8">
          {(["template", "details", "setup"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <div className="w-8 h-px bg-border" />}
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                  s === step
                    ? "bg-blue-600 text-white"
                    : ["template", "details", "setup"].indexOf(step) > i
                      ? "bg-success/15 text-success"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {["template", "details", "setup"].indexOf(step) > i ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  i + 1
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Step 1: Template */}
        {step === "template" && (
          <div className="flex flex-col md:flex-row gap-6">
            {/* Left sidebar — template list grouped by category */}
            <div className="md:w-56 flex-shrink-0 overflow-y-auto md:max-h-[calc(100vh-260px)] space-y-5 md:pr-2">
              {CATEGORY_ORDER.filter((cat) => TEMPLATES.some((t) => t.category === cat)).map(
                (cat) => (
                  <div key={cat}>
                    <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-2">
                      {CATEGORY_LABELS[cat]}
                    </h3>
                    <div className="space-y-0.5">
                      {TEMPLATES.filter((t) => t.category === cat).map((t) => {
                        const isActive = previewTemplate?.id === t.id;
                        const isSquadLead = t.id === "squad-lead";
                        const isDisabled = isSquadLead && hasSquadLead;
                        return (
                          <button
                            key={t.id}
                            onClick={() => setPreviewTemplate(t)}
                            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition text-sm ${
                              isActive
                                ? "bg-blue-50 text-blue-900 ring-1 ring-blue-200"
                                : isDisabled
                                  ? "text-muted-foreground"
                                  : "text-foreground hover:bg-muted"
                            }`}
                          >
                            <span className="text-base flex-shrink-0">{t.emoji}</span>
                            <span
                              className={`font-medium truncate ${isDisabled ? "line-through decoration-gray-300" : ""}`}
                            >
                              {t.name}
                            </span>
                            {isSquadLead && !hasSquadLead && (
                              <Star className="w-3 h-3 text-blue-500 flex-shrink-0 ml-auto" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ),
              )}
            </div>

            {/* Right panel — template details */}
            {previewTemplate && (
              <div className="flex-1 border border-border rounded-xl p-6 self-start">
                {/* Badges */}
                {previewTemplate.id === "squad-lead" && !hasSquadLead && (
                  <Badge variant="blue" className="mb-4">
                    <Star className="w-3 h-3" />
                    Recommended — Create First
                  </Badge>
                )}
                {previewTemplate.id === "squad-lead" && hasSquadLead && (
                  <Badge variant="gray" className="mb-4">
                    <Check className="w-3 h-3" />
                    Already created
                  </Badge>
                )}

                {/* Header */}
                <div className="flex items-start gap-4 mb-4">
                  <span className="text-4xl">{previewTemplate.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-bold text-foreground">{previewTemplate.name}</h2>
                    {previewTemplate.role && (
                      <p className="text-sm text-muted-foreground mt-0.5">{previewTemplate.role}</p>
                    )}
                  </div>
                  <Badge variant="gray" size="sm" className="flex-shrink-0">
                    {CATEGORY_LABELS[previewTemplate.category] || previewTemplate.category}
                  </Badge>
                </div>

                {/* Description */}
                <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
                  {previewTemplate.description}
                </p>

                {/* Personality / Behavior */}
                {previewTemplate.personality && (
                  <div className="mb-5 px-4 py-3 bg-muted rounded-lg border border-border">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                      Behavior
                    </p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {previewTemplate.personality}
                    </p>
                  </div>
                )}

                {/* Skills */}
                {previewTemplate.skills.length > 0 && (
                  <div className="mb-5">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Pre-loaded Skills
                    </p>
                    <ul className="space-y-1.5">
                      {previewTemplate.skills.map((s) => (
                        <li
                          key={s}
                          className="text-sm text-muted-foreground flex items-start gap-2"
                        >
                          <span className="mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-blue-400" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Capabilities */}
                {previewTemplate.capabilities.length > 0 && (
                  <div className="mb-6">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Capabilities
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {previewTemplate.capabilities.map((c) => (
                        <span
                          key={c}
                          className="px-2.5 py-1 text-xs bg-background text-muted-foreground border border-border rounded-full"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action */}
                <div className="pt-4 border-t border-border flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {previewTemplate.level === AgentLevel.LEAD
                      ? "Lead"
                      : previewTemplate.level === "intern"
                        ? "Intern"
                        : "Specialist"}{" "}
                    level
                  </span>
                  <Button
                    onClick={() => selectTemplate(previewTemplate)}
                    disabled={previewTemplate.id === "squad-lead" && hasSquadLead}
                    iconRight={<ArrowRight />}
                  >
                    Use This Template
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Details */}
        {step === "details" && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleCreate)} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Name <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <ShadcnInput type="text" placeholder="e.g. Nova, Rex, Luna" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <div className="flex items-center">
                        <span className="text-sm text-muted-foreground mr-1">@</span>
                        <FormControl>
                          <ShadcnInput
                            type="text"
                            value={field.value ?? ""}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                              )
                            }
                            placeholder={
                              form.watch("name")
                                ? form
                                    .watch("name")
                                    .toLowerCase()
                                    .replace(/[^a-z0-9]+/g, "-")
                                : "auto-generated"
                            }
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Role <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <ShadcnInput
                          type="text"
                          placeholder="e.g. Research Specialist"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="emoji"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Emoji</FormLabel>
                      <FormControl>
                        <ShadcnInput type="text" placeholder="🤖" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="personality"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Instructions / Personality</FormLabel>
                    <MentionTextArea
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      rows={4}
                      placeholder="Agent personality, behavior guidelines, and specific instructions... (@ to mention)"
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
                      suggestionSources={mentionSuggestionSources}
                      mentionMaps={mentionMaps}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="level"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Level</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="intern">Intern</SelectItem>
                          <SelectItem value="specialist">Specialist</SelectItem>
                          <SelectItem value="lead">Lead</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="workspacePath"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Workspace Path</FormLabel>
                      <FormControl>
                        <ShadcnInput
                          type="text"
                          placeholder={`~/.openclaw/agents/${
                            form.watch("name")
                              ? form
                                  .watch("name")
                                  .toLowerCase()
                                  .replace(/[^a-z0-9]+/g, "-")
                                  .replace(/^-|-$/g, "")
                              : "agent-name"
                          }/workspace`}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Leave blank to use the default OpenClaw workspace path
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex items-center justify-between pt-4">
                <Button
                  variant="ghost"
                  type="button"
                  icon={<ArrowLeft />}
                  onClick={() => setStep("template")}
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  loading={isCreating}
                  iconRight={!isCreating ? <ArrowRight /> : undefined}
                >
                  {isCreating ? "Creating..." : "Create Agent"}
                </Button>
              </div>
            </form>
          </Form>
        )}

        {/* Step 3: Setup */}
        {step === "setup" && result && (
          <div className="space-y-6">
            {/* Security warning */}
            <div className="border-2 border-destructive/30 bg-destructive-muted rounded-xl p-5">
              <div className="flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-destructive mb-1">
                    Sensitive Credentials — Handle with Care
                  </h3>
                  <p className="text-sm text-destructive">
                    The content below contains your API key. Anyone with it can connect bots to your
                    Mission Control system. Do not share publicly or commit to version control.
                  </p>
                </div>
              </div>
            </div>

            {/* Mode toggle */}
            <div className="flex bg-muted rounded-lg p-1 gap-1">
              {isDesktopApp && (
                <button
                  onClick={() => setSetupMode("desktop")}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition ${
                    setupMode === "desktop"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <MonitorDown className="w-4 h-4" />
                  Desktop App
                </button>
              )}
              <button
                onClick={() => setSetupMode("auto")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition ${
                  setupMode === "auto"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Send className="w-4 h-4" />
                Auto Setup
              </button>
              <button
                onClick={() => setSetupMode("manual")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition ${
                  setupMode === "manual"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Wrench className="w-4 h-4" />
                Manual Setup
              </button>
              {hasSquadLead && result?.agent?.level !== AgentLevel.LEAD && (
                <button
                  onClick={() => setSetupMode("delegate")}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition ${
                    setupMode === "delegate"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Bot className="w-4 h-4" />
                  Delegate to Lead
                </button>
              )}
              {cloudVmsEnabled && (
                <button
                  onClick={async () => {
                    setSetupMode("cloud");
                    if (existingVMs.length === 0) {
                      setVmListLoading(true);
                      try {
                        const res = await fetch("/api/cloud-vms");
                        if (res.ok) {
                          const data = await res.json();
                          setExistingVMs(
                            (data.vms || []).filter(
                              (vm: {
                                id: string;
                                status: string;
                                llmConfigured: boolean;
                                name?: string;
                              }) => vm.status === CloudVmStatus.RUNNING && vm.llmConfigured,
                            ),
                          );
                        }
                      } catch {
                        /* ignore */
                      } finally {
                        setVmListLoading(false);
                      }
                    }
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition ${
                    setupMode === "cloud"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Cloud className="w-4 h-4" />
                  Deploy to Cloud
                </button>
              )}
            </div>

            {/* ==================== DESKTOP APP TAB ==================== */}
            {setupMode === "desktop" && result && (
              <DesktopBootstrapButton
                payload={{
                  agentId: String(result.agent.username || result.agent.id),
                  agentName: String(result.agent.name ?? ""),
                  workspacePath: result.workspacePath,
                  configFiles: result.configFiles,
                  requiredClis: result.requiredClis,
                  cronSchedule: result.cronSchedule,
                  cronMessage: result.cronMessage,
                }}
              />
            )}

            {/* ==================== AUTO MODE ==================== */}
            {setupMode === "auto" && (
              <>
                <div className="border border-blue-200 bg-blue-50 rounded-xl p-5">
                  <div className="flex items-start gap-3">
                    <MessageSquare className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-blue-800 mb-1">
                        Send to Your Connected Channel
                      </h3>
                      <p className="text-sm text-blue-700">
                        Copy the message below and send it to your agent via any connected channel —
                        WhatsApp, Slack, Discord, Telegram, or any other OpenClaw channel. The agent
                        will read it and configure itself automatically.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Bootstrap message */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-foreground">Bootstrap Message</h3>
                    <CopyButton text={result.bootstrapMessage} label="Bootstrap message" />
                  </div>
                  <pre className="px-4 py-3 bg-foreground text-gray-100 rounded-xl text-xs font-mono overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap">
                    {result.bootstrapMessage}
                  </pre>
                </div>

                {/* Auto mode steps */}
                <div className="border border-border rounded-xl p-5">
                  <h3 className="font-semibold text-foreground mb-3">Steps</h3>
                  <ol className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-600">
                        1
                      </span>
                      Copy the bootstrap message above
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-600">
                        2
                      </span>
                      Send it to your agent via any connected channel (WhatsApp, Slack, Discord,
                      etc.)
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-600">
                        3
                      </span>
                      Agent will appear in the dashboard on next heartbeat
                    </li>
                  </ol>
                </div>
              </>
            )}

            {/* ==================== MANUAL MODE ==================== */}
            {setupMode === "manual" && (
              <>
                {/* API Key */}
                <div className="border-2 border-warning/30 bg-warning-muted rounded-xl p-5">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-warning mb-1">API Key — Save this now!</h3>
                      <p className="text-sm text-warning mb-3">
                        This key will only be shown once. It is already embedded in the config
                        files.
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 px-3 py-2 bg-background border border-warning/30 rounded-lg text-sm font-mono text-foreground break-all select-all">
                          {showApiKey ? result.apiKey : "••••••••••••••••••••••••••••••••"}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setShowApiKey((v) => !v)}
                          className="p-1.5 text-warning hover:text-warning transition"
                          title={showApiKey ? "Hide API key" : "Reveal API key"}
                        >
                          {showApiKey ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </Button>
                        <CopyButton text={result.apiKey} label="API Key" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 1. Register agent */}
                <div>
                  <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Terminal className="w-4 h-4" />
                    1. Register Agent in OpenClaw
                  </h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Add this to{" "}
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">agents.list</code> in{" "}
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                      ~/.openclaw/openclaw.json
                    </code>
                    :
                  </p>
                  <div className="flex items-start gap-2">
                    <pre className="flex-1 px-3 py-2 bg-foreground text-green-400 rounded-lg text-xs font-mono overflow-x-auto">
                      {JSON.stringify(result.openclawAgentConfig, null, 2)}
                    </pre>
                    <CopyButton
                      text={JSON.stringify(result.openclawAgentConfig, null, 2)}
                      label="Agent config"
                    />
                  </div>
                </div>

                {/* 2. Workspace + files */}
                <div>
                  <h3 className="font-semibold text-foreground mb-3">
                    2. Create Workspace &amp; Save Files
                  </h3>
                  <div className="flex items-center gap-2 mb-3">
                    <code className="flex-1 px-3 py-2 bg-foreground text-green-400 rounded-lg text-xs font-mono break-all">
                      mkdir -p {result.workspacePath}
                    </code>
                    <CopyButton text={`mkdir -p ${result.workspacePath}`} label="mkdir command" />
                  </div>
                </div>

                {/* Config files */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-foreground">Config Files</h3>
                    <DownloadZipButton
                      files={result.configFiles}
                      zipName={`${result.agent.username || (result.agent.name ?? "agent").toLowerCase().replace(/\s+/g, "-")}-config.zip`}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Extract to{" "}
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                      {result.workspacePath}/
                    </code>
                  </p>
                  <div className="space-y-3">
                    {result.configFiles.map((file) => (
                      <details key={file.filename} className="border border-border rounded-lg">
                        <summary className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted">
                          <span className="font-medium text-sm text-foreground">
                            {file.filename}
                          </span>
                          <div className="flex items-center gap-2">
                            <CopyButton text={file.content} label={file.filename} />
                            <DownloadButton filename={file.filename} content={file.content} />
                          </div>
                        </summary>
                        <div className="px-4 pb-4">
                          <pre className="text-xs text-muted-foreground bg-muted rounded-lg p-3 overflow-x-auto max-h-60">
                            {file.content}
                          </pre>
                        </div>
                      </details>
                    ))}
                  </div>
                </div>

                {/* 3. Cron */}
                <div>
                  <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Terminal className="w-4 h-4" />
                    3. Add Heartbeat Cron
                  </h3>
                  <div className="flex items-start gap-2">
                    <code className="flex-1 px-3 py-2 bg-foreground text-green-400 rounded-lg text-xs font-mono break-all">
                      {result.cronCommand}
                    </code>
                    <CopyButton text={result.cronCommand} label="Cron command" />
                  </div>
                </div>
              </>
            )}

            {/* ==================== DELEGATE MODE ==================== */}
            {setupMode === "delegate" && (
              <>
                <div className="border border-success/30 bg-success-muted rounded-xl p-5">
                  <div className="flex items-start gap-3">
                    <Bot className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-success mb-1">
                        Delegate Setup to Squad Lead
                      </h3>
                      <p className="text-sm text-success">
                        Create a task for your Squad Lead. It will bootstrap the workspace, register
                        with OpenClaw, and set up the heartbeat cron on its next wake-up.
                      </p>
                    </div>
                  </div>
                </div>

                {(delegateStatus === "idle" || delegateStatus === "creating") && (
                  <div className="space-y-4">
                    {/* Agent summary */}
                    <div className="border border-border rounded-xl p-4">
                      <h4 className="text-sm font-semibold text-foreground mb-3">
                        Task will include
                      </h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Name:</span>{" "}
                          <span className="font-medium text-foreground">{result.agent.name}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Role:</span>{" "}
                          <span className="font-medium text-foreground">
                            {result.agent.role ?? ""}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Level:</span>{" "}
                          <span className="font-medium text-foreground">
                            {result.agent.level ?? ""}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Assigned to:</span>{" "}
                          <span className="font-medium text-foreground">
                            {squadLeads[0]?.name ?? "Squad Lead"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Bootstrap message preview */}
                    <details className="border border-border rounded-lg">
                      <summary className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted">
                        <span className="font-medium text-sm text-foreground">
                          Bootstrap Message
                        </span>
                        <CopyButton text={result.bootstrapMessage} label="Bootstrap message" />
                      </summary>
                      <div className="px-4 pb-4">
                        <pre className="text-xs text-muted-foreground bg-muted rounded-lg p-3 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap">
                          {result.bootstrapMessage}
                        </pre>
                      </div>
                    </details>

                    {/* Cron command preview */}
                    <div className="border border-border rounded-lg px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm text-foreground">Cron Command</span>
                        <CopyButton text={result.cronCommand} label="Cron command" />
                      </div>
                      <code className="block px-3 py-2 bg-foreground text-green-400 rounded-lg text-xs font-mono break-all">
                        {result.cronCommand}
                      </code>
                    </div>

                    {/* API Key preview */}
                    <div className="border border-warning/30 bg-warning-muted rounded-lg px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm text-warning">
                          API Key (included in task)
                        </span>
                        <CopyButton text={result.apiKey} label="API Key" />
                      </div>
                      <code className="block px-3 py-2 bg-background border border-warning/30 rounded-lg text-xs font-mono text-foreground break-all select-all">
                        {result.apiKey}
                      </code>
                    </div>

                    {/* OpenClaw config preview */}
                    <details className="border border-border rounded-lg">
                      <summary className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted">
                        <span className="font-medium text-sm text-foreground">
                          OpenClaw Agent Config
                        </span>
                        <CopyButton
                          text={JSON.stringify(result.openclawAgentConfig, null, 2)}
                          label="Agent config"
                        />
                      </summary>
                      <div className="px-4 pb-4">
                        <pre className="text-xs text-muted-foreground bg-muted rounded-lg p-3 overflow-x-auto">
                          {JSON.stringify(result.openclawAgentConfig, null, 2)}
                        </pre>
                      </div>
                    </details>
                  </div>
                )}

                {delegateStatus === "created" && delegateTaskNumber !== null ? (
                  <div className="border-2 border-success/30 bg-success-muted rounded-xl p-5">
                    <div className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <h3 className="font-semibold text-success mb-1">
                          Task #{delegateTaskNumber} Created
                        </h3>
                        <p className="text-sm text-success">
                          Assigned to {squadLeads[0]?.name ?? "Squad Lead"}. The lead will handle
                          setup on next wake-up.
                        </p>
                      </div>
                    </div>
                    <div className="flex justify-end mt-4">
                      <Button icon={<Check />} onClick={() => router.push("/agents")}>
                        Done
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-center pt-2">
                    <Button
                      size="lg"
                      loading={delegateStatus === "creating"}
                      icon={<Send />}
                      onClick={async () => {
                        setDelegateStatus("creating");
                        try {
                          const taskDescription = [
                            `## Set up new agent: ${result.agent.name}`,
                            "",
                            `**Role:** ${result.agent.role}`,
                            `**Level:** ${result.agent.level}`,
                            `**Workspace:** \`${result.workspacePath}\``,
                            "",
                            "### Bootstrap Message",
                            "",
                            "```",
                            result.bootstrapMessage,
                            "```",
                            "",
                            "### Cron Command",
                            "",
                            "```",
                            result.cronCommand,
                            "```",
                            "",
                            "### API Key",
                            "",
                            `\`${result.apiKey}\``,
                            "",
                            "### OpenClaw Agent Config",
                            "",
                            "```json",
                            JSON.stringify(result.openclawAgentConfig, null, 2),
                            "```",
                          ].join("\n");

                          const res = await createTask({
                            title: `Set up new agent: ${result.agent.name} (${result.agent.role})`,
                            description: taskDescription,
                            assigneeIds: [squadLeads[0].id],
                            priority: Priority.HIGH,
                            tags: ["agent-setup"],
                          });

                          if (res.error) {
                            toast.error(res.error.message || "Failed to create task");
                            setDelegateStatus("idle");
                            return;
                          }

                          const taskNumber = res.data?.createTaskFromDashboard?.taskNumber;
                          setDelegateTaskNumber(taskNumber ?? null);
                          setDelegateStatus("created");
                          toast.success(`Task #${taskNumber} created`);
                        } catch {
                          toast.error("Failed to create task");
                          setDelegateStatus("idle");
                        }
                      }}
                    >
                      {delegateStatus === "creating" ? "Creating Task..." : "Create Setup Task"}
                    </Button>
                  </div>
                )}
              </>
            )}

            {/* ==================== CLOUD MODE ==================== */}
            {setupMode === "cloud" && (
              <>
                <div className="border border-purple-200 bg-purple-50 rounded-xl p-5">
                  <div className="flex items-start gap-3">
                    <Cloud className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-purple-800 mb-1">Host on Cloud VM</h3>
                      <p className="text-sm text-purple-700">
                        Deploy this agent to one of your cloud VMs. The VM will automatically set up
                        and start the agent. You&apos;ll know it&apos;s working when it sends its
                        first heartbeat.
                      </p>
                    </div>
                  </div>
                </div>

                {!cloudVmId && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Select a VM
                      </label>
                      {vmListLoading ? (
                        <div className="flex items-center gap-2 py-3 text-muted-foreground">
                          <Server className="w-4 h-4 animate-pulse" />
                          <span className="text-sm">Loading VMs...</span>
                        </div>
                      ) : existingVMs.length === 0 && !vmListLoading ? (
                        <div className="border border-border rounded-lg p-4 text-center">
                          <Server className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground mb-2">
                            No running VMs with LLM configured
                          </p>
                          <a
                            href="/cloud"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-purple-600 hover:text-purple-700 font-medium"
                          >
                            Create and configure a VM on the Cloud page first
                          </a>
                        </div>
                      ) : (
                        <select
                          value={selectedVmId}
                          onChange={(e) => setSelectedVmId(e.target.value)}
                          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-background"
                        >
                          <option value="">Choose a VM...</option>
                          {existingVMs.map((vm) => (
                            <option key={vm.id} value={vm.id}>
                              {vm.name || vm.serverName || vm.id.slice(0, 8)} — {vm.serverType} /{" "}
                              {vm.region}
                              {vm.ipv4 ? ` (${vm.ipv4})` : ""}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {selectedVmId && (
                      <div className="flex justify-center pt-2">
                        <Button
                          size="lg"
                          loading={cloudDeploying}
                          icon={<Cloud />}
                          onClick={async () => {
                            if (!result || !selectedVmId) return;
                            setCloudDeploying(true);
                            try {
                              const res = await fetch(`/api/cloud-vms/${selectedVmId}/agents`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ agentId: result.agent.id }),
                              });
                              if (!res.ok) {
                                const data = await res.json();
                                toast.error(data.error || "Failed to deploy agent");
                                return;
                              }
                              setCloudVmId(selectedVmId);
                              toast.success(
                                "Agent deployed! It will start automatically and send its first heartbeat shortly.",
                              );
                            } catch {
                              toast.error("Failed to deploy agent");
                            } finally {
                              setCloudDeploying(false);
                            }
                          }}
                        >
                          {cloudDeploying ? "Deploying..." : "Deploy to VM"}
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {cloudVmId && (
                  <div className="border border-success/30 bg-success-muted rounded-xl p-5">
                    <div className="flex items-center gap-3">
                      <Check className="w-5 h-5 text-success" />
                      <div>
                        <h3 className="font-semibold text-success">Agent deployed</h3>
                        <p className="text-sm text-success mt-0.5">
                          The VM is setting up your agent. Once it sends its first heartbeat,
                          you&apos;ll see it come online in the sidebar.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Done button */}
            <div className="flex justify-end pt-2">
              <Button icon={<Check />} onClick={() => router.push("/agents")}>
                Done
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
