/**
 * Central place for mention formats: @[id:profileId], @[agent:agentId], @[task:taskId], etc.
 * Used by: channel messages, MarkdownCommentPreview, MentionTextArea getInsertText, server mutations.
 */

/** Categories for @mention suggestion dropdown. Use to enable only specific types (e.g. suggest={['profile','task']}). */
export const MENTION_SUGGESTION_CATEGORIES = ["profile", "task", "project"] as const;
export type MentionSuggestionCategory = (typeof MENTION_SUGGESTION_CATEGORIES)[number];

export function isMentionSuggestionCategory(s: string): s is MentionSuggestionCategory {
  return (MENTION_SUGGESTION_CATEGORIES as readonly string[]).includes(s);
}

export const MENTION_TYPES = ["id", "agent", "task", "project"] as const;
export type MentionType = (typeof MENTION_TYPES)[number];

/** Check if a string is a valid mention type. */
export function isMentionType(s: string): s is MentionType {
  return MENTION_TYPES.includes(s as MentionType);
}

/** Format any mention for storage/API: @[type:id]. Use in getInsertText for MentionTextArea. */
export function formatMention(type: MentionType, id: string): string {
  return `@[${type}:${id}]`;
}

// --- Profile (id) — backward compatible names ---

/** Regex to match @[id:PROFILE_ID]. Use with .exec() or .matchAll(). */
export const MENTION_ID_REGEX = /@\[id:([^\]]+)\]/g;

/** Single-match regex for tokenizers (no g flag). */
export const MENTION_ID_REGEX_ONE = /^@\[id:([^\]]+)\]/;

/** @deprecated Use formatMention('id', profileId) */
export function formatMentionId(profileId: string): string {
  return formatMention("id", profileId);
}

/** Extract all profile IDs from content (only @[id:xxx] form). */
export function parseMentionIds(content: string): string[] {
  return parseMentions(content)
    .filter((m) => m.type === "id")
    .map((m) => m.id);
}

/** Extract all mentions from content: { type, id }[]. */
export function parseMentions(content: string): { type: MentionType; id: string }[] {
  const re = /@\[(id|agent|task|project):([^\]]+)\]/g;
  const out: { type: MentionType; id: string }[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    if (isMentionType(match[1])) {
      out.push({ type: match[1], id: match[2] });
    }
  }
  return out;
}

/** Single-match regex for any @[type:id] (for tokenizers). */
export const MENTION_ANY_REGEX_ONE = /^@\[(id|agent|task|project):([^\]]+)\]/;

export type ProfileLike = {
  id: string;
  username?: string | null;
  displayName: string;
};

export type AgentLike = { id: string; name: string };

export type TaskLike = {
  id: string;
  title: string;
  taskNumber?: string | number | null;
};

export type ProjectLike = { id: string; name: string };

/** Get display handle for a profile (username, or first word of displayName). */
export function getHandleForProfile(profile: ProfileLike | undefined): string {
  if (!profile) return "?";
  return profile.username || profile.displayName?.split(/\s+/)[0] || profile.displayName || "?";
}

/** Get display label for an agent. */
export function getHandleForAgent(agent: AgentLike | undefined): string {
  return agent?.name ?? "?";
}

/** Get display label for a task (task number + title when present). */
export function getHandleForTask(task: TaskLike | undefined): string {
  if (!task) return "?";
  const title = task.title || "?";
  if (task.taskNumber != null && task.taskNumber !== "") {
    return `#${task.taskNumber} ${title}`;
  }
  return title;
}

/** Get display label for a project. */
export function getHandleForProject(project: ProjectLike | undefined): string {
  return project?.name ?? "?";
}

/** Resolve @[id:profileId] in content to @handle for display. */
export function resolveMentionHandles(
  content: string,
  profileById: Map<string, Pick<ProfileLike, "username" | "displayName">>,
): string {
  return content.replace(MENTION_ID_REGEX, (_, profileId) => {
    const profile = profileById.get(profileId);
    return `@${getHandleForProfile(profile as ProfileLike | undefined)}`;
  });
}

/** Maps for resolving all mention types to display text (plain-text snippets). */
export interface ResolveAllMentionMaps {
  profileById?: Map<string, Pick<ProfileLike, "username" | "displayName">>;
  agentById?: Map<string, Pick<AgentLike, "name">>;
  taskById?: Map<string, Pick<TaskLike, "title" | "taskNumber">>;
  projectById?: Map<string, Pick<ProjectLike, "name">>;
}

const MENTION_ANY_REGEX = /@\[(id|agent|task|project):([^\]]+)\]/g;

/** Resolve all @[type:id] in content to display labels (e.g. @username, @AgentName, #123 Title). Use for plain-text snippets. */
export function resolveAllMentionHandles(content: string, maps: ResolveAllMentionMaps): string {
  const { profileById, agentById, taskById, projectById } = maps;
  return content.replace(MENTION_ANY_REGEX, (_, type: MentionType, id: string) => {
    if (type === "id" && profileById) {
      const profile = profileById.get(id);
      return `@${getHandleForProfile(profile as ProfileLike | undefined)}`;
    }
    if (type === "agent" && agentById) {
      const agent = agentById.get(id);
      return `@${getHandleForAgent(agent as AgentLike | undefined)}`;
    }
    if (type === "task" && taskById) {
      const task = taskById.get(id);
      return getHandleForTask(task as TaskLike | undefined);
    }
    if (type === "project" && projectById) {
      const project = projectById.get(id);
      return `@${getHandleForProject(project as ProjectLike | undefined)}`;
    }
    return `@[${type}:${id}]`;
  });
}

/** Regex to match @handle (single word after @) for conversion to id. */
const HANDLE_REGEX = /@(\w+)/g;

/** Convert @handle in content to @[id:profileId] for sending. Leaves unknown handles as-is. */
export function contentHandlesToIds(content: string, profiles: ProfileLike[]): string {
  return content.replace(HANDLE_REGEX, (_, word) => {
    const q = word.toLowerCase();
    const byUsername = profiles.find((p) => p.username?.toLowerCase() === q);
    if (byUsername) return formatMention("id", byUsername.id);
    const byFirst = profiles.find((p) => {
      const first = p.displayName?.split(/\s+/)[0]?.toLowerCase();
      return first === q;
    });
    if (byFirst) return formatMention("id", byFirst.id);
    return `@${word}`;
  });
}
