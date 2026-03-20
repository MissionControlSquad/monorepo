/**
 * Pure conversion functions for displaying @mentions as human-readable names
 * in the MentionTextArea, while preserving raw @[type:id] tokens for storage.
 */
import type { MentionType, ResolveAllMentionMaps } from "./mentions";
import {
  isMentionType,
  getHandleForProfile,
  getHandleForAgent,
  getHandleForTask,
  getHandleForProject,
} from "./mentions";
import type { ProfileLike, AgentLike, TaskLike, ProjectLike } from "./mentions";

/** Zero-width space used as delimiter around mention display text. */
export const ZWS = "\u200B";

export interface MentionMapEntry {
  /** The display text shown in textarea, e.g. "@dharmikjagodana" */
  displayText: string;
  /** The raw storage token, e.g. "@[id:cmlnin9k10001adkbnrogta4d]" */
  rawToken: string;
  /** The mention type for coloring */
  mentionType: MentionType;
}

const MENTION_ANY_REGEX = /@\[(id|agent|task|project):([^\]]+)\]/g;

function resolveDisplay(type: MentionType, id: string, maps: ResolveAllMentionMaps): string {
  if (type === "id" && maps.profileById) {
    const profile = maps.profileById.get(id);
    return `@${getHandleForProfile(profile as ProfileLike | undefined)}`;
  }
  if (type === "agent" && maps.agentById) {
    const agent = maps.agentById.get(id);
    return `@${getHandleForAgent(agent as AgentLike | undefined)}`;
  }
  if (type === "task" && maps.taskById) {
    const task = maps.taskById.get(id);
    return getHandleForTask(task as TaskLike | undefined);
  }
  if (type === "project" && maps.projectById) {
    const project = maps.projectById.get(id);
    return `@${getHandleForProject(project as ProjectLike | undefined)}`;
  }
  return `@[${type}:${id}]`;
}

/**
 * Convert raw value (with @[type:id] tokens) to display value
 * (with ZWS-delimited display names) plus a map of entries.
 */
export function rawToDisplay(
  rawValue: string,
  maps: ResolveAllMentionMaps,
): { displayValue: string; entries: MentionMapEntry[] } {
  const entries: MentionMapEntry[] = [];
  const displayValue = rawValue.replace(MENTION_ANY_REGEX, (match, type: string, id: string) => {
    if (!isMentionType(type)) return match;
    const displayText = resolveDisplay(type as MentionType, id, maps);
    entries.push({
      displayText,
      rawToken: match,
      mentionType: type as MentionType,
    });
    return `${ZWS}${displayText}${ZWS}`;
  });
  return { displayValue, entries };
}

/**
 * Convert display value back to raw value by finding ZWS-delimited regions
 * and replacing them with raw tokens from entries.
 */
export function displayToRaw(displayValue: string, entries: MentionMapEntry[]): string {
  if (entries.length === 0) return displayValue.replace(/\u200B/g, "");

  let result = "";
  let i = 0;

  while (i < displayValue.length) {
    if (displayValue[i] === ZWS) {
      // Look for the closing ZWS
      const closeIdx = displayValue.indexOf(ZWS, i + 1);
      if (closeIdx !== -1) {
        const mentionText = displayValue.slice(i + 1, closeIdx);
        // Find matching entry
        const entry = entries.find((e) => e.displayText === mentionText);
        if (entry) {
          result += entry.rawToken;
          i = closeIdx + 1;
          continue;
        }
      }
      // Orphaned ZWS — skip it
      i++;
      continue;
    }
    result += displayValue[i];
    i++;
  }

  return result;
}

export interface DisplaySegment {
  text: string;
  isMention: boolean;
  mentionType?: MentionType;
}

/**
 * Parse display text into segments of plain text and mention spans
 * for overlay rendering.
 */
export function parseDisplaySegments(
  displayValue: string,
  entries: MentionMapEntry[],
): DisplaySegment[] {
  if (entries.length === 0 || !displayValue.includes(ZWS)) {
    return [{ text: displayValue, isMention: false }];
  }

  const segments: DisplaySegment[] = [];
  let i = 0;

  while (i < displayValue.length) {
    if (displayValue[i] === ZWS) {
      const closeIdx = displayValue.indexOf(ZWS, i + 1);
      if (closeIdx !== -1) {
        const mentionText = displayValue.slice(i + 1, closeIdx);
        const entry = entries.find((e) => e.displayText === mentionText);
        if (entry) {
          // Include the ZWS delimiters in the mention span so overlay width matches
          segments.push({
            text: ZWS + mentionText + ZWS,
            isMention: true,
            mentionType: entry.mentionType,
          });
          i = closeIdx + 1;
          continue;
        }
      }
      // Orphaned ZWS — treat as plain text
      segments.push({ text: ZWS, isMention: false });
      i++;
      continue;
    }

    // Accumulate plain text until next ZWS
    let plainEnd = displayValue.indexOf(ZWS, i);
    if (plainEnd === -1) plainEnd = displayValue.length;
    segments.push({ text: displayValue.slice(i, plainEnd), isMention: false });
    i = plainEnd;
  }

  return segments;
}
