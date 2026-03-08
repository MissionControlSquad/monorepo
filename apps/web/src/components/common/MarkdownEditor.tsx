"use client";

import { useState, useRef, useCallback, useMemo, memo } from "react";
import { Bold, Italic, Heading, List, ListOrdered, Code, Quote, Link } from "lucide-react";
import { Button } from "../ui";
import { MarkdownWithMentions } from "./MarkdownWithMentions";
import { MentionTextArea } from "./MentionTextArea";
import { useMentionData, useMentionSuggestions } from "../context/MentionDataContext";
import { parseMentions } from "../../lib/mentions";
import type { MentionSuggestionCategory } from "../../lib/mentions";
import { MENTION_SUGGESTION_CATEGORIES } from "../../lib/mentions";
import type { Agent } from "@/lib/types";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  /** @deprecated Use central mention data (MentionDataProvider). Kept for compatibility, ignored. */
  agents?: Agent[];
  /** Called when content changes with list of mentioned agent IDs (from @[agent:id]). */
  onMention?: (agentIds: string[]) => void;
  /** Which mention categories to show in the dropdown. Defaults to all (profile, agent, task, project). */
  mentionCategories?: MentionSuggestionCategory[];
}

type ToolbarAction = {
  icon: React.ElementType;
  label: string;
  apply: (text: string, selStart: number, selEnd: number) => { text: string; cursor: number };
};

function wrapSelection(
  text: string,
  selStart: number,
  selEnd: number,
  before: string,
  after: string,
): { text: string; cursor: number } {
  const selected = text.slice(selStart, selEnd);
  const newText = text.slice(0, selStart) + before + selected + after + text.slice(selEnd);
  return {
    text: newText,
    cursor:
      selected.length > 0
        ? selStart + before.length + selected.length + after.length
        : selStart + before.length,
  };
}

function prependLine(
  text: string,
  selStart: number,
  selEnd: number,
  prefix: string,
): { text: string; cursor: number } {
  // Find the start of the current line
  const lineStart = text.lastIndexOf("\n", selStart - 1) + 1;
  const needsNewline = lineStart > 0 && text[lineStart - 1] !== "\n" && lineStart !== selStart;
  const insertion = (needsNewline ? "\n" : "") + prefix;
  const selected = text.slice(selStart, selEnd);

  if (selected.length > 0) {
    // Prefix each selected line
    const lines = text.slice(selStart, selEnd).split("\n");
    const prefixed = lines.map((l) => prefix + l).join("\n");
    const newText = text.slice(0, selStart) + prefixed + text.slice(selEnd);
    return { text: newText, cursor: selStart + prefixed.length };
  }

  const newText = text.slice(0, lineStart) + insertion + text.slice(lineStart);
  return { text: newText, cursor: lineStart + insertion.length };
}

const TOOLBAR_ACTIONS: (ToolbarAction | "divider")[] = [
  {
    icon: Bold,
    label: "Bold",
    apply: (text, s, e) => wrapSelection(text, s, e, "**", "**"),
  },
  {
    icon: Italic,
    label: "Italic",
    apply: (text, s, e) => wrapSelection(text, s, e, "_", "_"),
  },
  {
    icon: Heading,
    label: "Heading",
    apply: (text, s, e) => prependLine(text, s, e, "### "),
  },
  "divider",
  {
    icon: List,
    label: "Unordered list",
    apply: (text, s, e) => prependLine(text, s, e, "- "),
  },
  {
    icon: ListOrdered,
    label: "Ordered list",
    apply: (text, s, e) => prependLine(text, s, e, "1. "),
  },
  "divider",
  {
    icon: Code,
    label: "Inline code",
    apply: (text, s, e) => wrapSelection(text, s, e, "`", "`"),
  },
  {
    icon: Code,
    label: "Code block",
    apply: (text, s, e) => {
      const selected = text.slice(s, e);
      const before = (s > 0 && text[s - 1] !== "\n" ? "\n" : "") + "```\n";
      const after = "\n```" + (e < text.length && text[e] !== "\n" ? "\n" : "");
      const newText = text.slice(0, s) + before + selected + after + text.slice(e);
      return { text: newText, cursor: s + before.length + selected.length + after.length };
    },
  },
  {
    icon: Quote,
    label: "Quote",
    apply: (text, s, e) => prependLine(text, s, e, "> "),
  },
  {
    icon: Link,
    label: "Link",
    apply: (text, s, e) => {
      const selected = text.slice(s, e);
      if (selected.length > 0) {
        const newText = text.slice(0, s) + `[${selected}](url)` + text.slice(e);
        return { text: newText, cursor: s + selected.length + 3 }; // cursor on "url"
      }
      const newText = text.slice(0, s) + "[text](url)" + text.slice(e);
      return { text: newText, cursor: s + 1 }; // cursor on "text"
    },
  },
];

export const MarkdownEditor = memo(function MarkdownEditor({
  value,
  onChange,
  placeholder,
  rows = 4,
  className = "",
  agents: _agents,
  onMention,
  mentionCategories = [...MENTION_SUGGESTION_CATEGORIES],
}: MarkdownEditorProps) {
  const [activeTab, setActiveTab] = useState<"write" | "preview">("write");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionSources = useMentionSuggestions(mentionCategories);
  const { profileById, agentById, taskById, projectById } = useMentionData();
  const mentionMaps = useMemo(
    () => ({ profileById, agentById, taskById, projectById }),
    [profileById, agentById, taskById, projectById],
  );

  const handleChange = useCallback(
    (newValue: string) => {
      onChange(newValue);
      if (onMention) {
        const agentIds = parseMentions(newValue)
          .filter((m) => m.type === "agent")
          .map((m) => m.id);
        onMention(agentIds);
      }
    },
    [onChange, onMention],
  );

  const handleToolbarAction = useCallback(
    (action: ToolbarAction) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const selStart = textarea.selectionStart;
      const selEnd = textarea.selectionEnd;
      const result = action.apply(value, selStart, selEnd);

      onChange(result.text);

      // Restore focus and cursor position
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(result.cursor, result.cursor);
      }, 0);
    },
    [value, onChange],
  );

  return (
    <div className={`border border-border rounded-md overflow-hidden ${className}`}>
      {/* Tabs */}
      <div className="flex items-center border-b border-border bg-muted">
        <button
          type="button"
          onClick={() => setActiveTab("write")}
          className={`px-4 py-2 text-sm font-medium transition ${
            activeTab === "write"
              ? "text-foreground border-b-2 border-blue-500 bg-background"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Write
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("preview")}
          className={`px-4 py-2 text-sm font-medium transition ${
            activeTab === "preview"
              ? "text-foreground border-b-2 border-blue-500 bg-background"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Preview
        </button>
      </div>

      {/* Toolbar (write mode only) */}
      {activeTab === "write" && (
        <div className="flex items-center gap-0.5 px-2 py-1 border-b border-border bg-muted">
          {TOOLBAR_ACTIONS.map((item, i) => {
            if (item === "divider") {
              return <div key={`divider-${i}`} className="w-px h-5 bg-border mx-1" />;
            }
            const Icon = item.icon;
            return (
              <Button
                key={item.label}
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => handleToolbarAction(item)}
                title={item.label}
                aria-label={item.label}
                className="text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                <Icon className="w-4 h-4" />
              </Button>
            );
          })}
        </div>
      )}

      {/* Content area */}
      <div className="relative">
        {activeTab === "write" ? (
          <MentionTextArea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            placeholder={placeholder}
            rows={rows}
            className="w-full px-3 py-2 focus:outline-none focus:ring-0 resize-y border-0"
            suggestionSources={suggestionSources}
            mentionMaps={mentionMaps}
          />
        ) : (
          <div className="px-3 py-2" style={{ minHeight: `${rows * 1.5 + 1}rem` }}>
            {value.trim() ? (
              <MarkdownWithMentions content={value} />
            ) : (
              <p className="text-muted-foreground italic">Nothing to preview</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
