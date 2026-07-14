/**
 * CLI device-authorization flow (Epic #12). A CLI with no browser session starts a challenge, shows
 * the user a short code, the user approves it in an authenticated browser page, and the CLI polls to
 * collect the minted API key. Builds on mintApiKey (Epic #12). The plaintext key lives on the
 * challenge only between approval and the CLI's next poll, then is cleared.
 */
import { randomBytes } from "crypto";
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import { mintApiKey } from "./api-keys";
import {
  CLI_USER_CODE_ALPHABET,
  CLI_USER_CODE_LENGTH,
  normalizeUserCode,
} from "@agentcenter/utils";

const CHALLENGE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export type CliAuthStatus = "pending" | "approved" | "denied" | "expired";

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

function randomUserCode(): string {
  const bytes = randomBytes(CLI_USER_CODE_LENGTH);
  let out = "";
  for (let i = 0; i < CLI_USER_CODE_LENGTH; i++) {
    out += CLI_USER_CODE_ALPHABET[bytes[i] % CLI_USER_CODE_ALPHABET.length];
  }
  return out;
}

/** Device side: begin a challenge. Returns the deviceCode (secret) + userCode (shown to the human). */
export async function startCliAuth(
  keyName = "CLI",
  now: Date = new Date(),
): Promise<{ deviceCode: string; userCode: string; expiresAt: Date }> {
  const deviceCode = randomBytes(24).toString("hex");
  const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS);

  // Retry on the (rare) userCode collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const userCode = randomUserCode();
    try {
      await prisma.cliAuthChallenge.create({
        data: { deviceCode, userCode, keyName: keyName.trim() || "CLI", expiresAt },
      });
      return { deviceCode, userCode, expiresAt };
    } catch {
      // unique collision on userCode → try again
    }
  }
  throw new GraphQLError("Could not allocate a login code, try again", {
    extensions: { code: "INTERNAL_SERVER_ERROR" },
  });
}

/** Device side: poll with the deviceCode. On first poll after approval, returns the key ONCE. */
export async function pollCliAuth(
  deviceCode: string,
  now: Date = new Date(),
): Promise<{ status: CliAuthStatus | "not_found"; apiKey?: string }> {
  const c = await prisma.cliAuthChallenge.findUnique({ where: { deviceCode } });
  if (!c) return { status: "not_found" };

  if (c.status === "pending" && c.expiresAt <= now) {
    await prisma.cliAuthChallenge.update({ where: { id: c.id }, data: { status: "expired" } });
    return { status: "expired" };
  }
  if (c.status === "approved" && c.plainKey) {
    // Deliver the secret exactly once, then clear it.
    await prisma.cliAuthChallenge.update({ where: { id: c.id }, data: { plainKey: null } });
    return { status: "approved", apiKey: c.plainKey };
  }
  return { status: c.status as CliAuthStatus };
}

/** Browser side: look up a pending challenge by userCode to confirm before approving. */
export async function lookupCliAuth(userCode: string, now: Date = new Date()) {
  const c = await prisma.cliAuthChallenge.findUnique({
    where: { userCode: normalizeUserCode(userCode) },
    select: { keyName: true, status: true, expiresAt: true },
  });
  if (!c) return null;
  const expired = c.status === "pending" && c.expiresAt <= now;
  return { keyName: c.keyName, status: expired ? "expired" : (c.status as CliAuthStatus) };
}

/** Browser side (authenticated): approve a challenge — mints an API key bound to the approver. */
export async function approveCliAuth(
  input: { userCode: string; workspaceId: string; profileId: string },
  now: Date = new Date(),
): Promise<{ keyName: string }> {
  const c = await prisma.cliAuthChallenge.findUnique({
    where: { userCode: normalizeUserCode(input.userCode) },
  });
  if (!c) badRequest("Invalid code");
  if (c.status !== "pending") badRequest("This code has already been used");
  if (c.expiresAt <= now) {
    await prisma.cliAuthChallenge.update({ where: { id: c.id }, data: { status: "expired" } });
    badRequest("This code has expired");
  }

  const { apiKey, plainKey } = await mintApiKey({
    workspaceId: input.workspaceId,
    name: c.keyName,
    createdByProfileId: input.profileId,
  });
  await prisma.cliAuthChallenge.update({
    where: { id: c.id },
    data: {
      status: "approved",
      workspaceId: input.workspaceId,
      approvedByProfileId: input.profileId,
      apiKeyId: apiKey.id,
      plainKey,
    },
  });
  return { keyName: c.keyName };
}

/** Browser side (authenticated): deny a pending challenge. */
export async function denyCliAuth(userCode: string): Promise<boolean> {
  const c = await prisma.cliAuthChallenge.findUnique({
    where: { userCode: normalizeUserCode(userCode) },
  });
  if (!c || c.status !== "pending") return false;
  await prisma.cliAuthChallenge.update({ where: { id: c.id }, data: { status: "denied" } });
  return true;
}
