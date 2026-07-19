import SchemaBuilder from "@pothos/core";
import PrismaPlugin from "@pothos/plugin-prisma";
import RelayPlugin from "@pothos/plugin-relay";
import SimpleObjectsPlugin from "@pothos/plugin-simple-objects";
import type PrismaTypes from "./generated/pothos-types";
import { getDatamodel } from "./generated/pothos-types";
import { prisma } from "@agentcenter/database/client";
import type { YogaInitialContext } from "graphql-yoga";

/** Token payload stored in the mc_session JWT cookie. */
export interface SessionPayload {
  sub: string;
  username: string;
  profileId?: string;
  jti?: string;
  iat?: number;
}

/** Workspace-level role of the current human, resolved from buildbase (Epic #1). */
export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

/**
 * Per-request human tenancy, bridging the buildbase SaaS plane to the AgentCenter domain plane.
 * Present for human (session) requests; null for anonymous or agent (apiKeyHash) requests.
 * See docs/gap-plans/01-buildbase-tenancy.md. `workspaceId` is the buildbase workspace `_id`.
 */
export interface TenancyContext {
  /** buildbase human user id (during pre-buildbase bootstrap: the Profile id). */
  userId: string;
  /** buildbase workspace `_id` — the scoping key for every domain root row. */
  workspaceId: string;
  /** The human's role in the current workspace. */
  role: WorkspaceRole;
  /** True if the workspace role grants the given capability string. */
  can: (permission: string) => boolean;
}

export interface GraphQLContext extends YogaInitialContext {
  prisma: typeof prisma;
  /** Set when request has valid mc_session cookie (admin login with Profile). Used for createdByProfileId, fromProfileId, etc. */
  session: (SessionPayload & { profileId: string }) | null;
  /** Human workspace tenancy (Epic #1). Null for anonymous or agent requests. */
  tenancy: TenancyContext | null;
}

export const builder = new SchemaBuilder<{
  PrismaTypes: PrismaTypes;
  Context: GraphQLContext;
  Scalars: {
    DateTime: { Input: Date; Output: Date };
    JSON: { Input: unknown; Output: unknown };
  };
}>({
  plugins: [PrismaPlugin, RelayPlugin, SimpleObjectsPlugin],
  prisma: {
    client: prisma,
    dmmf: getDatamodel(),
  },
  relay: {},
});

// Register scalar types
builder.scalarType("DateTime", {
  serialize: (value) => value.toISOString(),
  parseValue: (value) => new Date(value as string),
});

builder.scalarType("JSON", {
  serialize: (value) => value,
  parseValue: (value) => value,
});

// Initialize root types
builder.queryType({});
builder.mutationType({});
builder.subscriptionType({});
