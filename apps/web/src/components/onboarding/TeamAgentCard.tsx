"use client";

import { X, Pencil } from "lucide-react";
import { Badge } from "../ui";

interface TeamAgentCardProps {
  emoji: string;
  name: string;
  username: string;
  role: string;
  description: string;
  capabilities: string[];
  templateId: string;
  isSquadLead?: boolean;
  onRemove?: () => void;
  onEdit: () => void;
}

export function TeamAgentCard({
  emoji,
  name,
  username,
  role,
  description,
  capabilities,
  isSquadLead,
  onRemove,
  onEdit,
}: TeamAgentCardProps) {
  return (
    <div className="group relative rounded-xl border border-border bg-background hover:shadow-sm transition-all p-3 sm:p-4">
      {/* Top-right action buttons — visible on hover */}
      <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="px-1.5 py-0.5 rounded text-[11px] text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors flex items-center gap-0.5"
          aria-label={`Edit ${name}`}
        >
          <Pencil className="w-3 h-3" />
          <span>Edit</span>
        </button>
        {!isSquadLead && onRemove && (
          <button
            onClick={onRemove}
            className="px-1.5 py-0.5 rounded text-[11px] text-muted-foreground hover:text-destructive hover:bg-destructive-muted transition-colors flex items-center gap-0.5"
            aria-label={`Remove ${name}`}
          >
            <X className="w-3 h-3" />
            <span>Remove</span>
          </button>
        )}
      </div>

      <div className="flex items-start gap-2.5">
        <span className="text-xl sm:text-2xl shrink-0">{emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="font-semibold text-sm text-foreground truncate" title={name}>
              {name}
            </span>
            {isSquadLead && (
              <Badge variant="indigo" className="text-[10px] px-1.5 py-0">
                Lead
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 mb-1">
            <p className="text-[11px] text-muted-foreground truncate">{role}</p>
            <span className="text-muted-foreground/30">·</span>
            <span className="text-[11px] text-muted-foreground/50 font-mono">@{username}</span>
          </div>
          <p className="text-[11px] text-muted-foreground/70 leading-relaxed line-clamp-2 hidden sm:block">
            {description}
          </p>

          {/* Capabilities pills — show fewer on mobile */}
          {capabilities.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {capabilities.slice(0, 3).map((cap) => (
                <span
                  key={cap}
                  className="inline-block px-1.5 py-0.5 text-[10px] rounded bg-muted text-muted-foreground border border-border"
                >
                  {cap}
                </span>
              ))}
              {capabilities.length > 3 && (
                <span className="inline-block px-1.5 py-0.5 text-[10px] rounded text-muted-foreground/50">
                  +{capabilities.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
