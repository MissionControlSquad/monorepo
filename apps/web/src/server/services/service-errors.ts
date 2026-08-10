import { GraphQLError } from "graphql";

/**
 * Shared GraphQL error helpers for the service layer.
 *
 * These wrap `GraphQLError` with the standard Apollo error `code` extensions so
 * every service throws the exact same shape. Previously each service file
 * defined its own private copy of these helpers (identical bodies), which this
 * module consolidates.
 */

/** Throw a BAD_USER_INPUT error — invalid/malformed caller input. */
export function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

/** Throw a NOT_FOUND error for the named entity, e.g. `notFound("Task")` → "Task not found". */
export function notFound(what: string): never {
  throw new GraphQLError(`${what} not found`, { extensions: { code: "NOT_FOUND" } });
}

/** Throw a CONFLICT error — the request conflicts with current state. */
export function conflict(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "CONFLICT" } });
}
