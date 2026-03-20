"use client";

import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/shadcn/dialog";
import {
  X,
  ExternalLink,
  Download,
  File,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  History,
} from "lucide-react";
import { useQuery } from "urql";
import { useHighlightedHtml } from "../../lib/useHighlight";
import { useTaskNavigation } from "../../hooks/useTaskNavigation";
import { MarkdownWithMentions } from "../common/MarkdownWithMentions";
import { CopyButton } from "../common/CopyButton";
import { TimeAgo } from "../common/TimeAgo";
import { Badge, Button } from "../ui";
import { DELIVERABLE_VERSIONS_QUERY } from "../../lib/graphql/queries";
import { getAssetUrl } from "@agentcenter/utils";
import type { Deliverable, Agent, DeliverableVersion } from "@agentcenter/types";

interface DeliverableFullViewProps {
  deliverable: Deliverable;
  isOpen: boolean;
  onClose: () => void;
  agents: Agent[];
  taskInfo?: {
    taskId: string;
    taskNumber?: number;
    taskTitle?: string;
  };
}

const KIND_CONFIG = {
  markdown: { label: "Markdown", variant: "purple" as const },
  code: { label: "Code", variant: "blue" as const },
  file: { label: "File", variant: "orange" as const },
  link: { label: "Link", variant: "green" as const },
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getVideoEmbedUrl(url: string): string | null {
  const ytMatch = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  );
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;

  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;

  return null;
}

function FileBody({ deliverable }: { deliverable: Deliverable | DeliverableVersion }) {
  const fileUrl = getAssetUrl(deliverable.storageKey) ?? deliverable.url ?? null;

  const mimeType = deliverable.mimeType || "";
  const isImage = mimeType.startsWith("image/");
  const isVideo = mimeType.startsWith("video/");
  const isAudio = mimeType.startsWith("audio/");
  const isPdf = mimeType === "application/pdf";
  const hasPreview = isImage || isVideo || isAudio || isPdf;

  return (
    <div className="space-y-4">
      {/* File metadata card */}
      <div className="rounded-lg border border-border bg-muted p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100">
            <File className="w-5 h-5 text-orange-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">
              {deliverable.fileName || "Untitled file"}
            </p>
            <p className="text-xs text-muted-foreground">
              {mimeType || "Unknown type"}
              {deliverable.fileSize != null && ` · ${formatFileSize(deliverable.fileSize)}`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {fileUrl && !hasPreview && (
              <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="ghost" size="sm" icon={<ExternalLink />}>
                  Open
                </Button>
              </a>
            )}
            {fileUrl && (
              <a
                href={fileUrl}
                download={deliverable.fileName || "download"}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="secondary" size="sm" icon={<Download />}>
                  Download
                </Button>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Image preview */}
      {isImage && fileUrl && (
        <div className="rounded-lg border border-border overflow-hidden bg-muted flex items-center justify-center">
          <img
            src={fileUrl}
            alt={deliverable.fileName || deliverable.title}
            className="max-w-full max-h-[60vh] object-contain"
            loading="lazy"
          />
        </div>
      )}

      {/* Video preview */}
      {isVideo && fileUrl && (
        <div className="rounded-lg border border-border overflow-hidden bg-black">
          <video src={fileUrl} controls className="w-full max-h-[60vh]">
            Your browser does not support video playback.
          </video>
        </div>
      )}

      {/* Audio preview */}
      {isAudio && fileUrl && (
        <div className="rounded-lg border border-border bg-muted p-4">
          <audio src={fileUrl} controls className="w-full">
            Your browser does not support audio playback.
          </audio>
        </div>
      )}

      {/* PDF preview */}
      {isPdf && fileUrl && (
        <div className="space-y-2">
          <iframe
            src={fileUrl}
            className="w-full h-[60vh] rounded-lg border border-border"
            title={deliverable.fileName || "PDF preview"}
          />
          <div className="flex justify-center">
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" />
              Open in new tab
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function CodeBlock({ content, language }: { content: string; language?: string }) {
  const highlightedHtml = useHighlightedHtml(content, language);

  return (
    <div className="relative">
      {language && (
        <div className="absolute top-2 right-2">
          <Badge variant="gray" size="sm">
            {language}
          </Badge>
        </div>
      )}
      <pre className="bg-gray-800 rounded-lg p-4 overflow-x-auto font-mono text-sm leading-relaxed">
        <code className="hljs" dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
      </pre>
    </div>
  );
}

export function DeliverableFullView({
  deliverable,
  isOpen,
  onClose,
  agents,
  taskInfo,
}: DeliverableFullViewProps) {
  const openTask = useTaskNavigation();
  const config = KIND_CONFIG[deliverable.kind as keyof typeof KIND_CONFIG];
  const deliverableProfile = deliverable.profile;
  const agent = deliverableProfile
    ? { name: deliverableProfile.displayName, avatar: deliverableProfile.avatarUrl }
    : agents.find((a: Agent) => a.id === deliverable.profileId);
  const videoEmbedUrl =
    deliverable.kind === "link" && deliverable.url ? getVideoEmbedUrl(deliverable.url) : null;

  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewingVersion, setViewingVersion] = useState<DeliverableVersion | null>(null);

  const [versionsResult] = useQuery({
    query: DELIVERABLE_VERSIONS_QUERY,
    variables: { deliverableId: deliverable.id },
    pause: !historyOpen,
  });

  const displayData = useMemo(() => viewingVersion ?? deliverable, [viewingVersion, deliverable]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="p-0 gap-0 w-full h-full sm:max-w-none lg:h-auto lg:max-w-4xl overflow-y-auto lg:rounded-2xl bg-background shadow-2xl"
      >
        <div className="flex flex-col h-full lg:h-[85vh]">
          {/* Header */}
          <div className="shrink-0 px-4 sm:px-6 py-3 sm:py-4 border-b border-border">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={config.variant} size="sm">
                    {config.label}
                  </Badge>
                  {deliverable.kind === "code" && deliverable.language && (
                    <Badge variant="gray" size="sm">
                      {deliverable.language}
                    </Badge>
                  )}
                </div>
                <DialogTitle className="text-lg font-semibold text-foreground">
                  {deliverable.title}
                </DialogTitle>
                {/* Agent + timestamp */}
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {agent && (
                    <>
                      <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-[10px] font-bold">
                        {agent.avatar || agent.name?.[0]}
                      </div>
                      <span className="text-xs text-muted-foreground">{agent.name}</span>
                      <span className="text-xs text-gray-300">·</span>
                    </>
                  )}
                  <TimeAgo
                    date={deliverable.createdAt ?? ""}
                    className="text-xs text-muted-foreground"
                  />
                  {taskInfo?.taskTitle && (
                    <>
                      <span className="text-xs text-gray-300">·</span>
                      <button
                        onClick={() => {
                          openTask(taskInfo.taskNumber ?? taskInfo.taskId);
                        }}
                        className="inline-flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 transition-colors max-w-[250px]"
                        title={`View task: ${taskInfo.taskTitle}`}
                      >
                        {taskInfo.taskNumber != null && (
                          <span className="font-semibold">#{taskInfo.taskNumber}</span>
                        )}
                        <span className="truncate">{taskInfo.taskTitle}</span>
                        <ArrowUpRight className="w-3 h-3 flex-shrink-0" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {/* Viewing older version banner */}
            {viewingVersion && (
              <div className="sticky top-0 z-20 bg-warning-muted border-b border-warning/30 px-4 sm:px-6 py-2 flex items-center justify-between">
                <span className="text-sm text-warning font-medium">
                  Viewing v{viewingVersion.version}
                </span>
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => setViewingVersion(null)}
                  className="px-0 text-warning hover:text-warning"
                >
                  Back to latest
                </Button>
              </div>
            )}

            {/* Sticky action bar */}
            {displayData.content && (
              <div className="sticky top-0 z-10 bg-muted border-b border-border px-4 sm:px-6 py-2">
                <CopyButton
                  text={displayData.content}
                  label="Copy content"
                  className="w-full justify-center border border-border bg-background hover:bg-muted rounded-lg px-3 py-1.5 text-sm"
                />
              </div>
            )}

            <div className="px-4 sm:px-6 py-4 sm:py-5">
              {/* Markdown */}
              {displayData.kind === "markdown" && displayData.content && (
                <div className="prose-sm max-w-none">
                  <MarkdownWithMentions
                    content={displayData.content}
                    className="markdown-content"
                  />
                </div>
              )}

              {/* Code */}
              {displayData.kind === "code" && displayData.content && (
                <CodeBlock
                  content={displayData.content}
                  language={displayData.language ?? undefined}
                />
              )}

              {/* File */}
              {displayData.kind === "file" && <FileBody deliverable={displayData} />}

              {/* Link — video embed or plain URL */}
              {displayData.kind === "link" &&
                displayData.url &&
                (videoEmbedUrl ? (
                  <div className="space-y-3">
                    <div className="rounded-lg overflow-hidden border border-border aspect-video">
                      <iframe
                        src={videoEmbedUrl}
                        className="w-full h-full"
                        allowFullScreen
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        title="Video"
                      />
                    </div>
                    <div className="flex justify-center">
                      <a
                        href={displayData.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Open original link
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12">
                    <a
                      href={displayData.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-blue-600 hover:text-blue-700 text-lg font-medium transition-colors"
                    >
                      <ExternalLink className="w-5 h-5" />
                      <span className="break-all">{displayData.url}</span>
                    </a>
                  </div>
                ))}

              {/* Version History */}
              {(deliverable.version ?? 0) > 1 && (
                <div className="mt-6 border-t border-border pt-4">
                  <button
                    onClick={() => setHistoryOpen((v) => !v)}
                    className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {historyOpen ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                    <History className="w-4 h-4" />
                    Version History
                  </button>
                  {historyOpen && (
                    <div className="mt-3 space-y-1">
                      {versionsResult.fetching && (
                        <p className="text-xs text-muted-foreground py-2">Loading...</p>
                      )}
                      {versionsResult.data?.deliverableVersions?.map((v: DeliverableVersion) => (
                        <button
                          key={v.id}
                          onClick={() => setViewingVersion(v)}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                            viewingVersion?.id === v.id
                              ? "bg-indigo-50 text-indigo-700"
                              : "hover:bg-muted text-muted-foreground"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">v{v.version}</span>
                            <TimeAgo
                              date={v.createdAt ?? ""}
                              className="text-xs text-muted-foreground"
                            />
                          </div>
                          {v.editedByProfile && (
                            <span className="text-xs text-muted-foreground">
                              {v.editedByProfile.displayName}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
