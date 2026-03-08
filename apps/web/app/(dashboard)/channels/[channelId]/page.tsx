"use client";

import { useParams } from "next/navigation";
import { useQuery } from "urql";
import { CHANNEL_QUERY, CHANNEL_BY_SLUG_QUERY } from "@/lib/graphql/queries";
import { ChannelView } from "@/components/channels/ChannelView";
import { ErrorBoundary, PanelErrorFallback } from "@/components/common/ErrorBoundary";
import { Breadcrumbs } from "@/components/ui";
import { Loader2 } from "lucide-react";

/** CUIDs are ~25 chars and start with "c"; slugs are short and may contain hyphens. */
function looksLikeId(param: string): boolean {
  return param.length >= 20 && /^c[a-z0-9]+$/i.test(param);
}

export default function ChannelPage() {
  const params = useParams();
  const channelIdOrSlug = (params.channelId as string) ?? "";

  const byId = channelIdOrSlug ? looksLikeId(channelIdOrSlug) : false;
  const [byIdResult] = useQuery({
    query: CHANNEL_QUERY,
    variables: { id: channelIdOrSlug || "_" },
    pause: !channelIdOrSlug || !byId,
  });
  const [bySlugResult] = useQuery({
    query: CHANNEL_BY_SLUG_QUERY,
    variables: { slug: channelIdOrSlug || "_" },
    pause: !channelIdOrSlug || byId,
  });

  if (!channelIdOrSlug) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        No channel selected
      </div>
    );
  }

  const result = byId ? byIdResult : bySlugResult;
  const channel = byId ? byIdResult.data?.channel : bySlugResult.data?.channelBySlug;
  const fetching = result.fetching;
  const notFound = !fetching && !channel;

  if (fetching && !channel) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Channel not found
      </div>
    );
  }

  return (
    <ErrorBoundary
      fallback={({ resetErrorBoundary, error }) => (
        <PanelErrorFallback label="Channel" error={error} onRetry={resetErrorBoundary} />
      )}
    >
      <div className="flex-shrink-0 px-4 pt-3">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Channels", href: "/channels" },
            { label: channel.name ?? "Channel" },
          ]}
        />
      </div>
      <ChannelView channelId={channel.id} />
    </ErrorBoundary>
  );
}
