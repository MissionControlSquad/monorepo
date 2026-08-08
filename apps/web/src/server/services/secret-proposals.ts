/**
 * Human-approved secret proposals (port of Paperclip #9934). Workspace-scoped.
 *
 * An agent (or the system) PROPOSES a secret it needs. The proposal row is INERT — it lives apart
 * from the live `secrets` table and grants no access — until an admin APPROVES it, at which point the
 * real vault secret is materialized through the existing `createSecret` path (reused, never
 * reimplemented) and the proposal is linked to it via `createdSecretId`. Deny records a reason.
 *
 * SECURITY: no plaintext secret is ever stored on a proposal. `placeholderValue` is only a non-secret
 * hint (a format/example); the admin supplies the actual secret value at approval time.
 */
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import type { Secret, SecretProposal } from "@agentcenter/database";
import { createSecret } from "./secrets";

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}
function notFound(what: string): never {
  throw new GraphQLError(`${what} not found`, { extensions: { code: "NOT_FOUND" } });
}
function conflict(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "CONFLICT" } });
}

export type ProposalScope = "workspace" | "agent";
export type ProposalStatus = "pending" | "approved" | "denied";

const SCOPES: ProposalScope[] = ["workspace", "agent"];
const STATUSES: ProposalStatus[] = ["pending", "approved", "denied"];

export function isProposalScope(v: string): v is ProposalScope {
  return (SCOPES as string[]).includes(v);
}
export function isProposalStatus(v: string): v is ProposalStatus {
  return (STATUSES as string[]).includes(v);
}

export interface CreateProposalInput {
  workspaceId: string;
  name: string;
  description?: string | null;
  scope?: ProposalScope | null;
  requestedByAgentId?: string | null;
  placeholderValue?: string | null;
}

/** File a new proposal. Always lands in `pending`; never touches the live secrets table. */
export async function createProposal(input: CreateProposalInput): Promise<SecretProposal> {
  const name = input.name.trim();
  if (!name) badRequest("name is required");
  const scope = input.scope ?? "workspace";
  if (!isProposalScope(scope)) badRequest(`invalid scope '${scope}'`);

  // An agent-scoped proposal must name a real agent in THIS workspace (never another tenant's).
  if (input.requestedByAgentId) {
    const agent = await prisma.agent.findFirst({
      where: { id: input.requestedByAgentId, workspaceId: input.workspaceId },
      select: { id: true },
    });
    if (!agent) badRequest("requesting agent not found in this workspace");
  }

  return prisma.secretProposal.create({
    data: {
      workspaceId: input.workspaceId,
      name,
      description: input.description ?? null,
      scope,
      requestedByAgentId: input.requestedByAgentId ?? null,
      placeholderValue: input.placeholderValue ?? null,
      status: "pending",
    },
  });
}

/** List a workspace's proposals, optionally filtered by status. Newest first. */
export function listProposals(
  workspaceId: string,
  status?: ProposalStatus | null,
): Promise<SecretProposal[]> {
  return prisma.secretProposal.findMany({
    where: { workspaceId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
  });
}

/** Load a proposal scoped to its workspace; 404 for missing / cross-workspace ids. */
async function findScopedProposal(
  proposalId: string,
  workspaceId: string,
): Promise<SecretProposal> {
  const proposal = await prisma.secretProposal.findFirst({
    where: { id: proposalId, workspaceId },
  });
  if (!proposal) notFound("Proposal");
  return proposal;
}

export interface ApproveProposalInput {
  workspaceId: string;
  proposalId: string;
  /** The real secret value the admin supplies (write-only; encrypted by createSecret, never stored on the proposal). */
  value: string;
  /** Optional overrides applied when materializing the vault secret. */
  name?: string | null;
  description?: string | null;
  /** The admin (buildbase userId — the profile id) approving the proposal. */
  decidedByProfileId: string;
}

/**
 * Approve a pending proposal: materialize the real vault Secret via the existing createSecret path
 * (attributed to the approving admin), then mark the proposal approved and link it to the new secret.
 * Reuses the secrets service — this never reimplements vault storage.
 */
export async function approveProposal(
  input: ApproveProposalInput,
): Promise<{ proposal: SecretProposal; secret: Secret }> {
  const proposal = await findScopedProposal(input.proposalId, input.workspaceId);
  if (proposal.status !== "pending")
    conflict(`proposal already ${proposal.status}`);
  if (!input.value) badRequest("value is required to approve");

  // Reuse the EXISTING secrets service to create the live vault secret (encrypted at rest, audited).
  const secret = await createSecret({
    workspaceId: input.workspaceId,
    name: (input.name ?? proposal.name).trim(),
    value: input.value,
    description: input.description ?? proposal.description,
    createdBy: input.decidedByProfileId,
  });

  const updated = await prisma.secretProposal.update({
    where: { id: proposal.id },
    data: {
      status: "approved",
      decidedByProfileId: input.decidedByProfileId,
      decidedAt: new Date(),
      createdSecretId: secret.id,
    },
  });
  return { proposal: updated, secret };
}

export interface DenyProposalInput {
  workspaceId: string;
  proposalId: string;
  reason: string;
  decidedByProfileId: string;
}

/** Deny a pending proposal with a required reason (surfaced back to the requester). */
export async function denyProposal(input: DenyProposalInput): Promise<SecretProposal> {
  const proposal = await findScopedProposal(input.proposalId, input.workspaceId);
  if (proposal.status !== "pending")
    conflict(`proposal already ${proposal.status}`);
  const reason = input.reason.trim();
  if (!reason) badRequest("a reason is required to deny");

  return prisma.secretProposal.update({
    where: { id: proposal.id },
    data: {
      status: "denied",
      decisionReason: reason,
      decidedByProfileId: input.decidedByProfileId,
      decidedAt: new Date(),
    },
  });
}
