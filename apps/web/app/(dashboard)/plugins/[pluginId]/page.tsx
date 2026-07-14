import { PluginDetailPage } from "@/views/PluginDetailPage";

export default async function PluginDetail({ params }: { params: Promise<{ pluginId: string }> }) {
  const { pluginId } = await params;
  return <PluginDetailPage pluginId={pluginId} />;
}
