// ─── Agent context bundle (Tier D — stateless runner) ───────────────────────
//
// The per-task context a stateless runner receives. Assembled control-plane-side from data we
// already own (agent identity + skills + instructions + the task, its project, and linked
// docs/deliverables/subtasks). There is NO persistent per-agent memory store: every task is
// self-contained, so the runner holds nothing between tasks and works on any platform.
//
// Shared by the server (which assembles it) and the @agentcenter/runner daemon (which consumes it),
// exactly like live-gateway-protocol.ts — one definition, no drift.

export interface AgentContextIdentity {
  id: string;
  name: string;
  role: string;
  personality: string | null;
  level: string | null;
}

/** An AGENTS.md-style instruction file (Epic #18). */
export interface AgentContextInstruction {
  fileName: string;
  content: string;
}

/** A skill available to the agent (Epic #10). Markdown is the executable/reference body. */
export interface AgentContextSkill {
  key: string;
  name: string;
  description: string | null;
  markdown: string;
}

export interface AgentContextTask {
  id: string;
  taskNumber: number;
  title: string;
  description: string;
  status: string;
  priority: string | null;
  tags: string[];
  parentTaskId: string | null;
}

/** The workspace/code the task operates on. The runner git-clones repoUrl@repoRef itself. */
export interface AgentContextProject {
  id: string;
  name: string;
  description: string | null;
  sourceType: string | null;
  repoUrl: string | null;
  repoRef: string | null;
}

export interface AgentContextDeliverable {
  id: string;
  title: string;
  kind: string;
  content: string | null;
}

export interface AgentContextDocument {
  id: string;
  title: string;
  content: string;
}

export interface AgentContextSubtask {
  id: string;
  title: string;
  status: string;
}

export interface AgentContextBundle {
  /** Bump when the shape changes so runners can guard on it. */
  version: 1;
  agent: AgentContextIdentity;
  instructions: AgentContextInstruction[];
  skills: AgentContextSkill[];
  task: AgentContextTask;
  project: AgentContextProject | null;
  deliverables: AgentContextDeliverable[];
  documents: AgentContextDocument[];
  subtasks: AgentContextSubtask[];
}
