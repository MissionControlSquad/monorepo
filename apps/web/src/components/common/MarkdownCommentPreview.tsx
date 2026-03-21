"use client";

import { useMemo } from "react";
import { Marked } from "marked";
import DOMPurify from "dompurify";
import { useHljs } from "../../lib/useHighlight";
import {
  MENTION_ANY_REGEX_ONE,
  getHandleForProfile,
  getHandleForAgent,
  getHandleForTask,
  getHandleForProject,
  type MentionType,
} from "@agentcenter/utils";
import "./MarkdownComment.css";

/** Allowed data attributes for mention links (for DOMPurify). */
export const MENTION_DATA_ATTRS = [
  "data-profile-id",
  "data-agent-id",
  "data-task-id",
  "data-project-id",
] as const;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Plain @username style (no brackets) — non-clickable fallback
const plainMentionExtension = {
  name: "mention",
  level: "inline" as const,
  start(src: string) {
    return src.indexOf("@");
  },
  tokenizer(src: string) {
    const match = src.match(/^@(\w+)/);
    if (match) {
      return { type: "mention", raw: match[0], username: match[1] };
    }
    return undefined;
  },
  renderer(token: { raw: string; username: string }) {
    return `<span class="mention-highlight">@${escapeHtml(token.username)}</span>`;
  },
};

/** Clickable @username extension — resolves bare @word against agent/profile maps. */
function createBareMentionExtension(maps: RichMentionMaps) {
  const { profileById, agentById } = maps;
  return {
    name: "mention",
    level: "inline" as const,
    start(src: string) {
      return src.indexOf("@");
    },
    tokenizer(src: string) {
      const match = src.match(/^@(\w+)/);
      if (match) {
        return { type: "mention", raw: match[0], username: match[1] };
      }
      return undefined;
    },
    renderer(token: { raw: string; username: string }) {
      const q = token.username.toLowerCase();

      // Match against profiles first (by username or first name)
      if (profileById) {
        for (const [id, profile] of profileById) {
          const username = profile.username?.toLowerCase();
          const firstName = profile.displayName?.split(/\s+/)[0]?.toLowerCase();
          if (username === q || firstName === q) {
            return `<span class="mention-highlight mention-link mention-id" data-profile-id="${escapeHtml(id)}">@${escapeHtml(token.username)}</span>`;
          }
        }
      }

      // Then match against agents by name
      if (agentById) {
        for (const [id, agent] of agentById) {
          if (agent.name.toLowerCase() === q || agent.name.split(/\s+/)[0]?.toLowerCase() === q) {
            return `<span class="mention-highlight mention-link mention-agent" data-agent-id="${escapeHtml(id)}">@${escapeHtml(token.username)}</span>`;
          }
        }
      }

      // No match — render as non-clickable highlight
      return `<span class="mention-highlight">@${escapeHtml(token.username)}</span>`;
    },
  };
}

/** Clickable #123 task reference extension — resolves bare #number against taskById map. */
function createBareTaskRefExtension(maps: RichMentionMaps) {
  const { taskById } = maps;
  return {
    name: "taskRef",
    level: "inline" as const,
    start(src: string) {
      return src.indexOf("#");
    },
    tokenizer(src: string) {
      const match = src.match(/^#(\d+)(?!\w)/);
      if (match) {
        return { type: "taskRef", raw: match[0], taskNumber: match[1] };
      }
      return undefined;
    },
    renderer(token: { raw: string; taskNumber: string }) {
      // Only render as clickable if the task exists in the map
      if (taskById) {
        for (const [id, task] of taskById) {
          if (String(task.taskNumber) === token.taskNumber) {
            return `<span class="mention-highlight mention-link mention-task" data-task-id="${escapeHtml(id)}">#${escapeHtml(token.taskNumber)}</span>`;
          }
        }
      }
      // Task not found — render as plain text
      return `#${escapeHtml(token.taskNumber)}`;
    },
  };
}

/** Options for the central rich-mention extension (@[id:], @[agent:], @[task:], @[project:]). */
export interface RichMentionMaps {
  profileById?: Map<string, { displayName: string; username?: string | null }>;
  agentById?: Map<string, { name: string }>;
  taskById?: Map<string, { title: string; taskNumber?: string | number | null }>;
  projectById?: Map<string, { name: string }>;
}

/** Single marked extension that tokenizes and renders @[id:], @[agent:], @[task:], @[project:]. */
export function createRichMentionExtension(maps: RichMentionMaps) {
  const { profileById, agentById, taskById, projectById } = maps;
  return {
    name: "richMention",
    level: "inline" as const,
    start(src: string) {
      const a = src.indexOf("@[id:");
      const b = src.indexOf("@[agent:");
      const c = src.indexOf("@[task:");
      const d = src.indexOf("@[project:");
      const idx = [a, b, c, d].filter((i) => i !== -1);
      return idx.length === 0 ? -1 : Math.min(...idx);
    },
    tokenizer(src: string) {
      const match = src.match(MENTION_ANY_REGEX_ONE);
      if (!match) return undefined;
      const type = match[1] as MentionType;
      const id = match[2];
      let handle = "?";
      if (type === "id" && profileById) {
        handle = getHandleForProfile(
          profileById.get(id) as
            | { id: string; displayName: string; username?: string | null }
            | undefined,
        );
      } else if (type === "agent" && agentById) {
        const agent = agentById.get(id);
        handle = agent ? getHandleForAgent({ id, name: agent.name }) : "?";
      } else if (type === "task" && taskById) {
        const task = taskById.get(id);
        handle = task
          ? getHandleForTask({ id, title: task.title, taskNumber: task.taskNumber })
          : "?";
      } else if (type === "project" && projectById) {
        const project = projectById.get(id);
        handle = project ? getHandleForProject({ id, name: project.name }) : "?";
      }
      return {
        type: "richMention",
        raw: match[0],
        mentionType: type,
        id,
        handle,
      };
    },
    renderer(token: { mentionType: string; id: string; handle: string }) {
      const attr =
        token.mentionType === "id"
          ? `data-profile-id="${escapeHtml(token.id)}"`
          : token.mentionType === "agent"
            ? `data-agent-id="${escapeHtml(token.id)}"`
            : token.mentionType === "task"
              ? `data-task-id="${escapeHtml(token.id)}"`
              : `data-project-id="${escapeHtml(token.id)}"`;
      // Tasks already show #number, so skip the @ prefix
      const label =
        token.mentionType === "task" ? escapeHtml(token.handle) : `@${escapeHtml(token.handle)}`;
      return `<span class="mention-highlight mention-link mention-${token.mentionType}" ${attr}>${label}</span>`;
    },
  };
}

// Plain marked instance (no syntax highlighting) — used while hljs loads
const plainMarked = new Marked({
  breaks: true,
  gfm: true,
  renderer: {
    code({ text, lang }) {
      const langClass = lang ? ` language-${lang}` : "";
      return `<pre><code class="hljs${langClass}">${escapeHtml(text)}</code></pre>`;
    },
  },
});
plainMarked.use({ extensions: [plainMentionExtension] });

function createHighlightedMarked(hljs: unknown): Marked {
  const m = new Marked({
    breaks: true,
    gfm: true,
    renderer: {
      code({ text, lang }: { text: string; lang?: string }) {
        if (lang && (hljs as { getLanguage: (l: string) => boolean }).getLanguage(lang)) {
          return `<pre><code class="hljs language-${lang}">${(hljs as { highlight: (t: string, o: { language: string }) => { value: string } }).highlight(text, { language: lang }).value}</code></pre>`;
        }
        return `<pre><code class="hljs">${(hljs as { highlightAuto: (t: string) => { value: string } }).highlightAuto(text).value}</code></pre>`;
      },
    },
  });
  m.use({ extensions: [plainMentionExtension] });
  return m;
}

let highlightedMarked: Marked | null = null;

export interface MarkdownCommentPreviewProps {
  content: string;
  className?: string;
  /** When set, @[id:xxx] is rendered as .mention-link[data-profile-id] (profiles). */
  mentionProfileById?: Map<string, { displayName: string; username?: string | null }>;
  /** When set, @[agent:xxx] is rendered as .mention-link[data-agent-id] (agents). */
  mentionAgentById?: Map<string, { name: string }>;
  /** When set, @[task:xxx] is rendered as .mention-link[data-task-id] (tasks). */
  mentionTaskById?: Map<string, { title: string; taskNumber?: string | number | null }>;
  /** When set, @[project:xxx] is rendered as .mention-link[data-project-id] (projects). */
  mentionProjectById?: Map<string, { name: string }>;
}

/**
 * Central markdown preview with @mention support.
 * Supports @[id:profileId], @[agent:agentId], @[task:taskId] when the corresponding *ById maps are passed.
 */
export function MarkdownCommentPreview({
  content,
  className = "",
  mentionProfileById,
  mentionAgentById,
  mentionTaskById,
  mentionProjectById,
}: MarkdownCommentPreviewProps) {
  const hljs = useHljs();

  const htmlContent = useMemo(() => {
    try {
      const hasRichMentions =
        (mentionProfileById && mentionProfileById.size > 0) ||
        (mentionAgentById && mentionAgentById.size > 0) ||
        (mentionTaskById && mentionTaskById.size > 0) ||
        (mentionProjectById && mentionProjectById.size > 0);

      let markedInstance: Marked;
      if (hasRichMentions) {
        const richExt = createRichMentionExtension({
          profileById: mentionProfileById,
          agentById: mentionAgentById,
          taskById: mentionTaskById,
          projectById: mentionProjectById,
        });
        markedInstance = new Marked({
          breaks: true,
          gfm: true,
          renderer: {
            code({ text, lang }: { text: string; lang?: string }) {
              if (hljs) {
                if (lang && hljs.getLanguage(lang)) {
                  return `<pre><code class="hljs language-${lang}">${hljs.highlight(text, { language: lang }).value}</code></pre>`;
                }
                return `<pre><code class="hljs">${hljs.highlightAuto(text).value}</code></pre>`;
              }
              const langClass = lang ? ` language-${lang}` : "";
              return `<pre><code class="hljs${langClass}">${escapeHtml(text)}</code></pre>`;
            },
          },
        });
        const bareMentionExt = createBareMentionExtension({
          profileById: mentionProfileById,
          agentById: mentionAgentById,
          taskById: mentionTaskById,
          projectById: mentionProjectById,
        });
        const bareTaskRefExt = createBareTaskRefExtension({
          profileById: mentionProfileById,
          agentById: mentionAgentById,
          taskById: mentionTaskById,
          projectById: mentionProjectById,
        });
        markedInstance.use({ extensions: [richExt, bareMentionExt, bareTaskRefExt] });
      } else if (hljs) {
        if (!highlightedMarked) {
          highlightedMarked = createHighlightedMarked(hljs);
        }
        markedInstance = highlightedMarked;
      } else {
        markedInstance = plainMarked;
      }
      const raw = markedInstance.parse(content) as string;
      return DOMPurify.sanitize(raw, { ADD_ATTR: [...MENTION_DATA_ATTRS] });
    } catch (error) {
      console.error("Error parsing markdown:", error);
      return DOMPurify.sanitize(content, { ADD_ATTR: [...MENTION_DATA_ATTRS] });
    }
  }, [content, hljs, mentionProfileById, mentionAgentById, mentionTaskById, mentionProjectById]);

  return (
    <div
      className={`markdown-comment-preview mt-1 ${className}`}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
}
