"use client";

/**
 * Central text area with @mention autocomplete.
 * Use formatMention from "../../lib/mentions" for canonical insert text:
 *   - Profiles: getInsertText={(p) => formatMention("id", p.id) + " "}
 *   - Agents:   getInsertText={(a) => formatMention("agent", a.id) + " "}
 *   - Tasks:     getInsertText={(t) => formatMention("task", t.id) + " "}
 * Preview: use MarkdownWithMentions for centralized mention resolution (or MarkdownCommentPreview with maps).
 */
import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useImperativeHandle,
  forwardRef,
  useMemo,
} from "react";
import { createPortal } from "react-dom";
import { MentionSuggestionList } from "./MentionSuggestionList";
import type { ResolveAllMentionMaps } from "../../lib/mentions";
import { rawToDisplay, displayToRaw, ZWS, type MentionMapEntry } from "../../lib/mentionDisplay";

const MIRROR_STYLE_PROPS = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "letterSpacing",
  "lineHeight",
  "textTransform",
  "wordSpacing",
  "padding",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderWidth",
  "boxSizing",
  "width",
] as const;

function getCaretPosition(
  textarea: HTMLTextAreaElement,
  position: number,
): { top: number; left: number } {
  const mirror = document.createElement("div");
  const computed = getComputedStyle(textarea);
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";
  mirror.style.overflow = "hidden";
  for (const prop of MIRROR_STYLE_PROPS) {
    const v = computed[prop];
    if (v) (mirror.style as unknown as Record<string, string>)[prop] = v;
  }
  const textBefore = textarea.value.substring(0, position);
  const textNode = document.createTextNode(textBefore);
  const span = document.createElement("span");
  span.textContent = textarea.value.substring(position) || ".";
  mirror.appendChild(textNode);
  mirror.appendChild(span);
  document.body.appendChild(mirror);
  const top = span.offsetTop - textarea.scrollTop;
  const left = span.offsetLeft;
  document.body.removeChild(mirror);
  return { top, left };
}

export type MentionTextAreaDropdownPosition = "above" | "portal";

/** Single source for multi-type suggestions (e.g. People + Tasks). */
export interface MentionSuggestionSource<T = unknown> {
  /** Section label (e.g. "People", "Tasks") */
  label?: string;
  suggestions: T[];
  getInsertText: (item: T) => string;
  filterSuggestions?: (items: T[], query: string) => T[];
  renderItem?: (item: T, index: number, isSelected: boolean) => React.ReactNode;
}

export interface MentionTextAreaProps<T = unknown> {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  minRows?: number;
  maxHeight?: string;
  className?: string;
  disabled?: boolean;
  /** Character that triggers mention suggestions (default "@") */
  triggerChar?: string;
  /** Single list (use with getInsertText). Ignored when suggestionSources is set. */
  suggestions?: T[];
  /** Text to insert when an item is selected. Ignored when suggestionSources is set. */
  getInsertText?: (item: T) => string;
  /** Optional: filter suggestions by query. Ignored when suggestionSources is set. */
  filterSuggestions?: (items: T[], query: string) => T[];
  /** Optional: custom render for each suggestion. Ignored when suggestionSources is set. */
  renderSuggestion?: (item: T, isSelected: boolean) => React.ReactNode;
  /** Multiple suggestion types (e.g. People + Tasks). When set, suggestions/getInsertText are ignored. */
  suggestionSources?: MentionSuggestionSource<unknown>[];
  /** Where to show dropdown: "above" = above input, "portal" = fixed near caret */
  dropdownPosition?: MentionTextAreaDropdownPosition;
  /** Header text shown in dropdown */
  dropdownHeader?: string;
  /** Called when dropdown is closed by click outside */
  onDropdownClose?: () => void;
  /** Called when a mention is selected from the dropdown, with the raw item and inserted text */
  onMentionSelect?: (item: unknown, insertText: string) => void;
  /** Parent can handle keydown; we only intercept when mention dropdown is open */
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  /** Maps for resolving @[type:id] to display names. When provided, enables display-name mode. */
  mentionMaps?: ResolveAllMentionMaps;
}

const defaultFilter = <T,>(items: T[], query: string, getInsertText: (item: T) => string): T[] => {
  if (!query.trim()) return items;
  const q = query.toLowerCase();
  return items.filter((item) => {
    const text = getInsertText(item).toLowerCase();
    return text.includes(q) || text.replace(/^@\s*/, "").startsWith(q);
  });
};

type FlatEntry = {
  item: unknown;
  getInsertText: (x: unknown) => string;
  renderItem?: (x: unknown, index: number, isSelected: boolean) => React.ReactNode;
};

function MentionTextAreaInner<T>(
  {
    value,
    onChange,
    placeholder,
    rows = 2,
    minRows,
    maxHeight,
    className = "",
    disabled,
    triggerChar = "@",
    suggestions = [],
    getInsertText = ((x: unknown) => String(x)) as (item: T) => string,
    filterSuggestions,
    renderSuggestion,
    suggestionSources,
    dropdownPosition = "portal",
    dropdownHeader,
    onDropdownClose,
    onMentionSelect,
    onKeyDown,
    mentionMaps,
  }: MentionTextAreaProps<T>,
  ref: React.Ref<HTMLTextAreaElement | null>,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);

  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionAnchor, setMentionAnchor] = useState(0);
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const [caretCoords, setCaretCoords] = useState({ top: 0, left: 0 });

  // Display-name mode state
  const [displayValue, setDisplayValue] = useState("");
  const mentionEntriesRef = useRef<MentionMapEntry[]>([]);
  const lastEmittedRawRef = useRef<string>("");

  // Sync value prop → displayValue when mentionMaps is provided
  useEffect(() => {
    if (!mentionMaps) return;
    // Skip if this is the same raw value we just emitted (prevents sync loops)
    if (value === lastEmittedRawRef.current) return;
    const { displayValue: dv, entries } = rawToDisplay(value, mentionMaps);
    setDisplayValue(dv);
    mentionEntriesRef.current = entries;
  }, [value, mentionMaps]);

  const { flatEntries, sectionHeaders } = useMemo(() => {
    if (suggestionSources && suggestionSources.length > 0) {
      const flat: FlatEntry[] = [];
      const headers: { index: number; label: string }[] = [];
      for (const src of suggestionSources) {
        const filtered =
          src.filterSuggestions != null
            ? src.filterSuggestions(src.suggestions, mentionQuery)
            : defaultFilter(
                src.suggestions,
                mentionQuery,
                src.getInsertText as (x: unknown) => string,
              );
        if (src.label && filtered.length > 0)
          headers.push({ index: flat.length, label: src.label });
        for (const item of filtered) {
          flat.push({
            item,
            getInsertText: src.getInsertText as (x: unknown) => string,
            renderItem: src.renderItem as
              | ((x: unknown, i: number, s: boolean) => React.ReactNode)
              | undefined,
          });
        }
      }
      return { flatEntries: flat, sectionHeaders: headers };
    }
    const filtered =
      filterSuggestions != null
        ? filterSuggestions(suggestions as T[], mentionQuery)
        : defaultFilter(suggestions as T[], mentionQuery, getInsertText);
    const entries: FlatEntry[] = filtered.map((item) => ({
      item,
      getInsertText: getInsertText as (x: unknown) => string,
      renderItem: renderSuggestion
        ? (_x: unknown, _i: number, isSelected: boolean) => renderSuggestion(item as T, isSelected)
        : undefined,
    }));
    return { flatEntries: entries, sectionHeaders: [] };
  }, [
    suggestionSources,
    suggestions,
    mentionQuery,
    filterSuggestions,
    getInsertText,
    renderSuggestion,
  ]);

  const filtered = flatEntries;

  useEffect(() => setMentionSelectedIndex(0), [filtered.length, mentionQuery]);

  useEffect(() => {
    if (!mentionOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const el = textareaRef.current;
      const list = dropdownRef.current ?? containerRef.current?.querySelector("[role=listbox]");
      if (el?.contains(e.target as Node) || list?.contains(e.target as Node)) return;
      setMentionOpen(false);
      onDropdownClose?.();
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [mentionOpen, onDropdownClose]);

  // Close dropdown on scroll or resize so it never ends up mispositioned
  useEffect(() => {
    if (!mentionOpen) return;
    const close = () => {
      setMentionOpen(false);
      onDropdownClose?.();
    };
    window.addEventListener("resize", close);
    // Capture-phase scroll so we catch scrolls on any ancestor
    document.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [mentionOpen, onDropdownClose]);

  useImperativeHandle<HTMLTextAreaElement | null, HTMLTextAreaElement | null>(
    ref,
    () => textareaRef.current,
    [],
  );

  const updateMentionState = useCallback(
    (val: string, cursor: number) => {
      const textBeforeCursor = val.slice(0, cursor);
      const lastAt = textBeforeCursor.lastIndexOf(triggerChar);
      if (lastAt === -1) {
        setMentionOpen(false);
        return;
      }
      const afterAt = textBeforeCursor.slice(lastAt + triggerChar.length);
      const wordMatch = afterAt.match(/^[\w]*/);
      const query = wordMatch ? wordMatch[0] : "";
      if (afterAt.length > 0 && (/\s/.test(afterAt) || query.length !== afterAt.length)) {
        setMentionOpen(false);
        return;
      }
      setMentionAnchor(lastAt);
      setMentionQuery(query);
      setMentionOpen(true);
      setMentionSelectedIndex(0);
      if (dropdownPosition === "portal" && textareaRef.current) {
        const coords = getCaretPosition(textareaRef.current, lastAt);
        const rect = textareaRef.current.getBoundingClientRect();
        setCaretCoords({
          top: rect.top + coords.top,
          left: rect.left + coords.left,
        });
      }
    },
    [triggerChar, dropdownPosition],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      const cursor = e.target.selectionStart ?? 0;

      if (!mentionMaps) {
        // Legacy path: no display-name mode
        onChange(val);
        updateMentionState(val, cursor);
        return;
      }

      // Display-name mode: update displayValue, convert back to raw
      setDisplayValue(val);

      // Check if any mentions were broken by editing within them
      // Re-parse entries: only keep entries whose display text still exists in val
      const currentEntries = mentionEntriesRef.current.filter((entry) => {
        const markedText = `${ZWS}${entry.displayText}${ZWS}`;
        return val.includes(markedText);
      });
      mentionEntriesRef.current = currentEntries;

      const raw = displayToRaw(val, currentEntries);
      lastEmittedRawRef.current = raw;
      onChange(raw);
      updateMentionState(val, cursor);
    },
    [onChange, updateMentionState, mentionMaps],
  );

  const handleMentionSelect = useCallback(
    (entry: FlatEntry) => {
      const rawInsert = entry.getInsertText(entry.item);

      if (!mentionMaps) {
        // Legacy path
        const end = mentionAnchor + triggerChar.length + mentionQuery.length;
        const before = value.slice(0, mentionAnchor);
        const after = value.slice(end);
        const newValue = before + rawInsert + after;
        onChange(newValue);
        setMentionOpen(false);
        setMentionQuery("");
        onMentionSelect?.(entry.item, rawInsert);
        const newPos = mentionAnchor + rawInsert.length;
        requestAnimationFrame(() => {
          textareaRef.current?.focus();
          textareaRef.current?.setSelectionRange(newPos, newPos);
        });
        return;
      }

      // Display-name mode: resolve the raw token to display text
      const { displayValue: insertDisplay, entries: insertEntries } = rawToDisplay(
        rawInsert.trimEnd(),
        mentionMaps,
      );
      const displayInsert = insertDisplay + " ";

      const end = mentionAnchor + triggerChar.length + mentionQuery.length;
      const before = displayValue.slice(0, mentionAnchor);
      const after = displayValue.slice(end);
      const newDisplayValue = before + displayInsert + after;

      // Add new entries to our entries list
      mentionEntriesRef.current = [...mentionEntriesRef.current, ...insertEntries];

      setDisplayValue(newDisplayValue);
      const raw = displayToRaw(newDisplayValue, mentionEntriesRef.current);
      lastEmittedRawRef.current = raw;
      onChange(raw);
      setMentionOpen(false);
      setMentionQuery("");
      onMentionSelect?.(entry.item, rawInsert);

      const newPos = mentionAnchor + displayInsert.length;
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(newPos, newPos);
      });
    },
    [
      value,
      displayValue,
      mentionAnchor,
      mentionQuery,
      triggerChar,
      onChange,
      onMentionSelect,
      mentionMaps,
    ],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (mentionOpen && filtered.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setMentionSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setMentionSelectedIndex((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          handleMentionSelect(filtered[mentionSelectedIndex]);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setMentionOpen(false);
          onDropdownClose?.();
          return;
        }
      }

      // Backspace at mention boundary: delete entire mention
      if (mentionMaps && e.key === "Backspace" && textareaRef.current) {
        const cursor = textareaRef.current.selectionStart;
        const selEnd = textareaRef.current.selectionEnd;
        // Only intercept when there's no selection and cursor is right after a ZWS (end of mention)
        if (cursor === selEnd && cursor > 0 && displayValue[cursor - 1] === ZWS) {
          // Find the opening ZWS before this closing one
          const openIdx = displayValue.lastIndexOf(ZWS, cursor - 2);
          if (openIdx !== -1) {
            const mentionText = displayValue.slice(openIdx + 1, cursor - 1);
            const entryIdx = mentionEntriesRef.current.findIndex(
              (ent) => ent.displayText === mentionText,
            );
            if (entryIdx !== -1) {
              e.preventDefault();
              // Remove the mention span (including both ZWS delimiters)
              const newDisplay = displayValue.slice(0, openIdx) + displayValue.slice(cursor);
              mentionEntriesRef.current = mentionEntriesRef.current.filter(
                (_, i) => i !== entryIdx,
              );
              setDisplayValue(newDisplay);
              const raw = displayToRaw(newDisplay, mentionEntriesRef.current);
              lastEmittedRawRef.current = raw;
              onChange(raw);
              requestAnimationFrame(() => {
                textareaRef.current?.setSelectionRange(openIdx, openIdx);
              });
              return;
            }
          }
        }
      }

      onKeyDown?.(e);
    },
    [
      mentionOpen,
      filtered,
      mentionSelectedIndex,
      handleMentionSelect,
      onKeyDown,
      onDropdownClose,
      mentionMaps,
      displayValue,
      onChange,
    ],
  );

  // Copy handler: strip ZWS from clipboard
  const handleCopy = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (!mentionMaps) return;
      const selection = window.getSelection()?.toString() ?? "";
      if (selection) {
        e.preventDefault();
        e.clipboardData.setData("text/plain", selection.replace(/\u200B/g, ""));
      }
    },
    [mentionMaps],
  );

  // Paste handler: strip ZWS from pasted content
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (!mentionMaps) return;
      const pasted = e.clipboardData.getData("text/plain");
      if (pasted.includes("\u200B")) {
        e.preventDefault();
        const cleaned = pasted.replace(/\u200B/g, "");
        const textarea = textareaRef.current;
        if (textarea) {
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const currentVal = mentionMaps ? displayValue : value;
          const newVal = currentVal.slice(0, start) + cleaned + currentVal.slice(end);
          // Trigger through display path
          setDisplayValue(newVal);
          const currentEntries = mentionEntriesRef.current.filter((entry) => {
            const markedText = `${ZWS}${entry.displayText}${ZWS}`;
            return newVal.includes(markedText);
          });
          mentionEntriesRef.current = currentEntries;
          const raw = displayToRaw(newVal, currentEntries);
          lastEmittedRawRef.current = raw;
          onChange(raw);
          const newPos = start + cleaned.length;
          requestAnimationFrame(() => {
            textarea.setSelectionRange(newPos, newPos);
          });
        }
      }
    },
    [mentionMaps, displayValue, value, onChange],
  );

  const textareaValue = mentionMaps ? displayValue : value;

  const dropdownList = (
    <MentionSuggestionList
      items={filtered}
      selectedIndex={mentionSelectedIndex}
      onSelect={(entry: FlatEntry) => handleMentionSelect(entry)}
      renderItem={(entry: FlatEntry, _i, isSelected) =>
        entry.renderItem ? (
          entry.renderItem(entry.item, _i, isSelected)
        ) : (
          <span className="truncate">{entry.getInsertText(entry.item).trim()}</span>
        )
      }
      header={dropdownHeader}
      sectionHeaders={sectionHeaders}
      variant="above"
      position={dropdownPosition === "portal" ? "portal" : "inline"}
      portalStyle={dropdownPosition === "portal" ? caretCoords : undefined}
      listRef={dropdownRef}
    />
  );

  return (
    <div ref={containerRef} className="relative">
      <textarea
        ref={textareaRef}
        value={textareaValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onCopy={handleCopy}
        onPaste={handlePaste}
        placeholder={placeholder}
        rows={minRows ?? rows}
        style={maxHeight ? { maxHeight } : undefined}
        className={className}
        disabled={disabled}
      />
      {mentionOpen &&
        filtered.length > 0 &&
        (dropdownPosition === "portal" && typeof document !== "undefined"
          ? createPortal(dropdownList, document.body)
          : dropdownList)}
    </div>
  );
}

export const MentionTextArea = forwardRef(MentionTextAreaInner) as <T = unknown>(
  props: MentionTextAreaProps<T> & { ref?: React.Ref<HTMLTextAreaElement | null> },
) => React.ReactElement;
