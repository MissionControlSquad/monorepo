"use client";

import { X, Pencil, Check } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Badge } from "../ui";

interface TeamAgentCardProps {
  emoji: string;
  name: string;
  role: string;
  description: string;
  isSquadLead?: boolean;
  onRemove?: () => void;
  onNameChange?: (name: string) => void;
}

export function TeamAgentCard({
  emoji,
  name,
  role,
  description,
  isSquadLead,
  onRemove,
  onNameChange,
}: TeamAgentCardProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commitEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== name) {
      onNameChange?.(trimmed);
    } else {
      setEditValue(name);
    }
    setEditing(false);
  };

  return (
    <div className="group relative rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 hover:border-neutral-700 transition-colors">
      {/* Remove button */}
      {!isSquadLead && onRemove && (
        <button
          onClick={onRemove}
          className="absolute top-2 right-2 p-1 rounded-md text-neutral-600 hover:text-neutral-300 hover:bg-neutral-800 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Remove agent"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}

      <div className="flex items-start gap-3">
        <span className="text-2xl flex-shrink-0">{emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            {editing ? (
              <div className="flex items-center gap-1">
                <input
                  ref={inputRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit();
                    if (e.key === "Escape") {
                      setEditValue(name);
                      setEditing(false);
                    }
                  }}
                  onBlur={commitEdit}
                  className="bg-neutral-800 border border-neutral-700 rounded px-1.5 py-0.5 text-sm font-semibold text-neutral-100 outline-none focus:border-indigo-500 w-32"
                />
                <button
                  onClick={commitEdit}
                  className="p-0.5 text-neutral-400 hover:text-neutral-200"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <>
                <span className="font-semibold text-sm text-neutral-100 truncate">{name}</span>
                {onNameChange && (
                  <button
                    onClick={() => setEditing(true)}
                    className="p-0.5 text-neutral-600 hover:text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Edit name"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                )}
              </>
            )}
            {isSquadLead && (
              <Badge variant="indigo" className="text-[10px] px-1.5 py-0">
                Orchestrator
              </Badge>
            )}
          </div>
          <p className="text-xs text-neutral-400 mb-1">{role}</p>
          <p className="text-xs text-neutral-500 leading-relaxed line-clamp-2">{description}</p>
        </div>
      </div>
    </div>
  );
}
