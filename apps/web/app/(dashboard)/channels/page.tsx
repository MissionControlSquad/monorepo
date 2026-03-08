"use client";

import { MessageSquare, Plus } from "lucide-react";
import { useChannelsLayout } from "@/components/channels/ChannelsLayoutContext";
import { Breadcrumbs, Button } from "@/components/ui";

export default function ChannelsPage() {
  const channelsLayout = useChannelsLayout();

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-muted/50 p-8 text-center">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Channels" }]} />
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <MessageSquare className="w-8 h-8 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold text-gray-800">Channels</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        Select a channel from the list or create one to start chatting.
      </p>
      <Button
        onClick={() => channelsLayout?.openCreateModal()}
        className="mt-4 inline-flex items-center gap-2"
      >
        <Plus className="w-4 h-4" />
        Create channel
      </Button>
    </div>
  );
}
