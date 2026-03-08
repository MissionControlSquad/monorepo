import SchemaBuilder from "@pothos/core";
import PrismaPlugin from "@pothos/plugin-prisma";
import RelayPlugin from "@pothos/plugin-relay";
import SimpleObjectsPlugin from "@pothos/plugin-simple-objects";
import type PrismaTypes from "./generated/pothos-types";
import { getDatamodel } from "./generated/pothos-types";
import { prisma } from "../prisma";
import type { YogaInitialContext } from "graphql-yoga";
import type { SessionPayload } from "../admin-auth";

export interface GraphQLContext extends YogaInitialContext {
  prisma: typeof prisma;
  /** Set when request has valid mc_session cookie (admin login with Profile). Used for createdByProfileId, fromProfileId, etc. */
  session: (SessionPayload & { profileId: string }) | null;
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
