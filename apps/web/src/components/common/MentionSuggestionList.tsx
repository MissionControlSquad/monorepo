"use client";

import React, { forwardRef, useCallback, useLayoutEffect, useRef as useInternalRef } from "react";
import { ProfileAvatar } from "../ui/ProfileAvatar";

/** Shared UI for @mention suggestion dropdowns (composer, search filter, etc.). */
export type MentionSuggestionListVariant = "above" | "below";
export type MentionSuggestionListPosition = "inline" | "portal";

export interface MentionSuggestionListProps<T> {
  /** List of suggestion items */
  items: T[];
  /** Index of the focused/selected item */
  selectedIndex: number;
  /** Called when user selects an item (click or Enter) */
  onSelect: (item: T, index: number) => void;
  /** Render each item. Use onMouseDown(e) => e.preventDefault() on buttons so focus stays in input. */
  renderItem: (item: T, index: number, isSelected: boolean) => React.ReactNode;
  /** Optional header text above the list */
  header?: string;
  /** "above" = dropdown above trigger, "below" = below (e.g. search) */
  variant?: MentionSuggestionListVariant;
  /** "inline" = absolute in flow, "portal" = fixed with style.top/left */
  position?: MentionSuggestionListPosition;
  /** For portal: { top, left } in pixels. Ignored when position="inline". */
  portalStyle?: { top: number; left: number };
  /** Optional ref for the list element */
  listRef?: React.RefObject<HTMLUListElement | null>;
  /** Optional id for a11y */
  id?: string;
  /** Optional section headers: before item at index, show label (e.g. "People", "Tasks") */
  sectionHeaders?: { index: number; label: string }[];
}

const listBaseClasses =
  "py-1 bg-background border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto z-[100]";
const listPositionClasses = {
  inlineAbove: "absolute left-0 right-0 bottom-full mb-1",
  inlineBelow: "absolute left-0 right-0 top-full mt-1",
  portal: "fixed w-64 max-w-[calc(100vw-2rem)]",
};

function MentionSuggestionListInner<T>(
  {
    items,
    selectedIndex,
    onSelect,
    renderItem,
    header,
    variant = "above",
    position = "inline",
    portalStyle,
    listRef,
    id,
    sectionHeaders = [],
  }: MentionSuggestionListProps<T>,
  ref: React.Ref<HTMLUListElement | null>,
) {
  const internalRef = useInternalRef<HTMLUListElement | null>(null);

  const listRefCopy = useInternalRef(listRef);
  listRefCopy.current = listRef;
  const fwdRefCopy = useInternalRef(ref);
  fwdRefCopy.current = ref;

  const setRef = useCallback(
    (el: HTMLUListElement | null) => {
      internalRef.current = el;
      const lr = listRefCopy.current;
      if (lr && typeof lr === "object" && "current" in lr) {
        (lr as React.MutableRefObject<HTMLUListElement | null>).current = el;
      }
      const fr = fwdRefCopy.current;
      if (typeof fr === "function") fr(el);
      else if (fr && typeof fr === "object" && "current" in fr) {
        (fr as React.MutableRefObject<HTMLUListElement | null>).current = el;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Clamp portal dropdown within viewport so it never gets clipped off-screen
  useLayoutEffect(() => {
    const el = internalRef.current;
    if (!el || position !== "portal" || !portalStyle) return;
    const rect = el.getBoundingClientRect();
    // If dropdown overflows above the viewport, flip it below the trigger
    if (rect.top < 0) {
      el.style.transform = "none";
    }
    // If dropdown overflows the right edge, shift left
    if (rect.right > window.innerWidth) {
      el.style.left = `${Math.max(8, window.innerWidth - rect.width - 8)}px`;
    }
    // If dropdown overflows the left edge, shift right
    if (rect.left < 0) {
      el.style.left = "8px";
    }
    // If dropdown overflows the bottom edge, shift up
    if (rect.bottom > window.innerHeight) {
      el.style.top = `${Math.max(8, window.innerHeight - rect.height - 8)}px`;
      el.style.transform = "none";
    }
  }, [position, portalStyle, items.length]);

  if (items.length === 0) return null;
  const headerSet = new Set(sectionHeaders.map((h) => h.index));

  const isPortal = position === "portal";
  const positionClass =
    position === "portal"
      ? listPositionClasses.portal
      : variant === "above"
        ? listPositionClasses.inlineAbove
        : listPositionClasses.inlineBelow;

  return (
    <ul
      ref={setRef}
      id={id}
      role="listbox"
      className={`${listBaseClasses} ${positionClass}`}
      style={
        isPortal && portalStyle
          ? {
              top: portalStyle.top,
              left: portalStyle.left,
              transform: variant === "above" ? "translateY(-100%)" : undefined,
            }
          : undefined
      }
    >
      {header && (
        <div className="px-3 py-1.5 border-b border-border bg-muted/80 sticky top-0">
          <p className="text-xs text-muted-foreground font-medium">{header}</p>
        </div>
      )}
      {items.map((item, i) => (
        <React.Fragment key={i}>
          {headerSet.has(i) && (
            <li className="px-3 py-1.5 border-b border-border bg-muted/80 sticky top-0" aria-hidden>
              <p className="text-xs text-muted-foreground font-medium">
                {sectionHeaders.find((h) => h.index === i)?.label}
              </p>
            </li>
          )}
          <li>
            <button
              type="button"
              role="option"
              aria-selected={i === selectedIndex}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(item, i)}
              className={`w-full text-left px-3 py-2 flex items-center gap-2 text-sm transition-colors ${
                i === selectedIndex
                  ? "bg-indigo-50 text-indigo-900"
                  : "hover:bg-muted text-gray-800"
              }`}
            >
              {renderItem(item, i, i === selectedIndex)}
            </button>
          </li>
        </React.Fragment>
      ))}
    </ul>
  );
}

export const MentionSuggestionList = forwardRef(MentionSuggestionListInner) as <T>(
  props: MentionSuggestionListProps<T> & { ref?: React.Ref<HTMLUListElement | null> },
) => React.ReactElement;

/** Profile-like shape for the default profile renderer */
export interface ProfileSuggestionItem {
  id: string;
  kind?: string | null;
  displayName?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
}

/** Default render for profile suggestions: avatar + displayName + @username + kind badge. Use for consistent UI. */
export function renderProfileSuggestion(
  profile: ProfileSuggestionItem,
  _index: number,
  _isSelected: boolean,
): React.ReactNode {
  const isAgent = profile.kind === "agent";
  return (
    <>
      <ProfileAvatar src={profile.avatarUrl} name={profile.displayName} size="sm" />
      <span className="font-medium truncate">{profile.displayName ?? "?"}</span>
      {profile.username && (
        <span className="text-muted-foreground truncate">@{profile.username}</span>
      )}
      <span
        className={`text-[10px] px-1.5 py-0.5 rounded ml-auto shrink-0 ${isAgent ? "text-violet-500 bg-violet-50" : "text-muted-foreground bg-muted"}`}
      >
        {isAgent ? "agent" : "human"}
      </span>
    </>
  );
}

/** Agent-like shape for the default agent renderer (icon + name + username) */
export interface AgentSuggestionItem {
  id: string;
  name: string;
  username?: string | null;
  identityEmoji?: string | null;
  avatar?: string | null;
  profile?: { displayName?: string; username?: string | null; avatarUrl?: string | null } | null;
}

/** Default render for agent suggestions: icon + name + @username. Same layout as profiles. */
export function renderAgentSuggestion(
  agent: AgentSuggestionItem,
  _index: number,
  _isSelected: boolean,
): React.ReactNode {
  const displayName = agent.profile?.displayName ?? agent.name;
  const username = agent.username ?? agent.profile?.username;
  const avatar = agent.profile?.avatarUrl ?? agent.avatar;
  return (
    <>
      <ProfileAvatar src={avatar} name={displayName} emoji={agent.identityEmoji} size="sm" />
      <span className="font-medium truncate">{displayName}</span>
      {username && <span className="text-muted-foreground truncate">@{username}</span>}
    </>
  );
}

/** Task-like shape for the default task renderer */
export interface TaskSuggestionItem {
  id: string;
  title: string;
  taskNumber?: string | number | null;
}

/** Default render for task suggestions: task ID (#number) + title. */
export function renderTaskSuggestion(
  task: TaskSuggestionItem,
  _index: number,
  _isSelected: boolean,
): React.ReactNode {
  const taskId = task.taskNumber != null ? `#${task.taskNumber}` : task.id.slice(0, 8);
  return (
    <>
      <span className="shrink-0 w-6 h-6 rounded bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-medium">
        #
      </span>
      <span className="font-medium truncate">{task.title}</span>
      <span className="text-muted-foreground truncate text-xs">{taskId}</span>
    </>
  );
}

/** Project-like shape for the default project renderer */
export interface ProjectSuggestionItem {
  id: string;
  name: string;
}

/** Default render for project suggestions: project title only. */
export function renderProjectSuggestion(
  project: ProjectSuggestionItem,
  _index: number,
  _isSelected: boolean,
): React.ReactNode {
  return (
    <>
      <span className="shrink-0 w-6 h-6 rounded bg-warning/15 text-warning flex items-center justify-center text-xs font-medium">
        ⌂
      </span>
      <span className="font-medium truncate">{project.name}</span>
    </>
  );
}
