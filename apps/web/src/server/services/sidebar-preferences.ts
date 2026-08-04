/**
 * Sidebar preferences (Paperclip parity: server/src/services/sidebar-preferences.ts). Per-user nav
 * customization — preferred order + hidden items — keyed by (workspaceId, userId). orderedIds/hiddenIds
 * are nav hrefs; normalized to unique, non-empty strings on write.
 */
import { prisma } from "@/server/prisma";

export interface SidebarPreference {
  orderedIds: string[];
  hiddenIds: string[];
}

/** Dedupe, trim, drop empties — matches Paperclip's normalizeOrderedIds. */
export function normalizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export async function getSidebarPreference(
  workspaceId: string,
  userId: string,
): Promise<SidebarPreference> {
  const row = await prisma.userSidebarPreference.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  return {
    orderedIds: normalizeIds(row?.orderedIds),
    hiddenIds: normalizeIds(row?.hiddenIds),
  };
}

export async function setSidebarPreference(
  workspaceId: string,
  userId: string,
  orderedIds: string[],
  hiddenIds: string[],
): Promise<SidebarPreference> {
  const ordered = normalizeIds(orderedIds);
  const hidden = normalizeIds(hiddenIds);
  await prisma.userSidebarPreference.upsert({
    where: { workspaceId_userId: { workspaceId, userId } },
    create: { workspaceId, userId, orderedIds: ordered, hiddenIds: hidden },
    update: { orderedIds: ordered, hiddenIds: hidden },
  });
  return { orderedIds: ordered, hiddenIds: hidden };
}
