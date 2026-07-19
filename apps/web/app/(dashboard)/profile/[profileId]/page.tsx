import { ProfileAnalyticsPage } from "@/views/ProfileAnalyticsPage";

export default async function ProfileAnalytics({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  const { profileId } = await params;
  return <ProfileAnalyticsPage profileId={profileId} />;
}
