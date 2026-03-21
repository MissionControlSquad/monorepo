"use client";

import { useState, useEffect } from "react";
import { BookOpen } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/shadcn/sheet";
import { Button, Badge } from "../ui";
import { SkillPreviewSheet } from "./SkillPreviewSheet";

interface AgentEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  emoji: string;
  name: string;
  username: string;
  role: string;
  description: string;
  capabilities: string[];
  skills: string[];
  templateId: string;
  isSquadLead?: boolean;
  onNameChange: (name: string) => void;
  onUsernameChange: (username: string) => void;
  onRemove?: () => void;
}

export function AgentEditSheet({
  open,
  onOpenChange,
  emoji,
  name,
  username,
  role,
  description,
  capabilities,
  skills,
  templateId,
  isSquadLead,
  onNameChange,
  onUsernameChange,
  onRemove,
}: AgentEditSheetProps) {
  const [localName, setLocalName] = useState(name);
  const [localUsername, setLocalUsername] = useState(username);
  const [skillGuideOpen, setSkillGuideOpen] = useState(false);

  // Sync when props change (e.g. reopened with different agent)
  useEffect(() => {
    setLocalName(name);
    setLocalUsername(username);
  }, [name, username]);

  const handleSave = () => {
    const trimmedName = localName.trim();
    if (trimmedName && trimmedName !== name) {
      onNameChange(trimmedName);
    }

    const cleanedUsername = localUsername
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9_-]/g, "");
    if (cleanedUsername && cleanedUsername.length >= 2 && cleanedUsername !== username) {
      onUsernameChange(cleanedUsername);
      setLocalUsername(cleanedUsername);
    }

    onOpenChange(false);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="shrink-0 px-5 pt-5 pb-4 border-b border-border">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{emoji}</span>
              <div>
                <SheetTitle className="text-base">{name}</SheetTitle>
                <SheetDescription className="flex items-center gap-1.5">
                  {role}
                  {isSquadLead && (
                    <Badge variant="indigo" className="text-[10px] px-1.5 py-0">
                      Orchestrator
                    </Badge>
                  )}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {/* Name field */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                Display Name
              </label>
              <input
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-muted border border-border rounded-lg outline-none focus:border-primary text-foreground"
              />
            </div>

            {/* Username field */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                Username <span className="text-muted-foreground/50">(used for @mentions)</span>
              </label>
              <div className="flex items-center">
                <span className="px-3 py-2 text-sm text-muted-foreground bg-muted border border-r-0 border-border rounded-l-lg">
                  @
                </span>
                <input
                  value={localUsername}
                  onChange={(e) => setLocalUsername(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm bg-muted border border-border rounded-r-lg outline-none focus:border-primary text-foreground font-mono"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                Description
              </label>
              <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
            </div>

            {/* Capabilities */}
            {capabilities.length > 0 && (
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                  Capabilities
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {capabilities.map((cap) => (
                    <span
                      key={cap}
                      className="inline-block px-2 py-1 text-xs rounded-md bg-muted text-muted-foreground border border-border"
                    >
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Skills */}
            {skills.length > 0 && (
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                  Skills
                </label>
                <div className="space-y-1.5">
                  {skills.map((skill) => (
                    <div
                      key={skill}
                      className="flex items-start gap-2 text-sm text-muted-foreground leading-relaxed"
                    >
                      <span className="text-primary mt-0.5 shrink-0">•</span>
                      <span>{skill}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Skill guide link */}
            <button
              onClick={() => setSkillGuideOpen(true)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              <BookOpen className="w-4 h-4" />
              <span>View full skill guide</span>
            </button>
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-border px-5 py-4 flex items-center justify-between gap-3">
            {!isSquadLead && onRemove ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onRemove();
                  onOpenChange(false);
                }}
                className="text-destructive hover:text-destructive hover:bg-destructive-muted"
              >
                Remove Agent
              </Button>
            ) : (
              <div />
            )}
            <Button onClick={handleSave}>Save Changes</Button>
          </div>
        </SheetContent>
      </Sheet>

      <SkillPreviewSheet
        open={skillGuideOpen}
        onOpenChange={setSkillGuideOpen}
        templateId={templateId}
        agentName={name}
        agentEmoji={emoji}
      />
    </>
  );
}
