import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { useState, useCallback, useEffect } from "react";
import { useQuery } from "urql";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenLoading } from "../src/components/ScreenLoading";
import { ScreenError } from "../src/components/ScreenError";
import {
  TASK_STATUS_COUNTS_QUERY,
  TASK_CYCLE_TIMES_QUERY,
  AGENT_PRODUCTIVITY_QUERY,
  TASK_COMPLETION_TREND_QUERY,
  REVIEW_METRICS_QUERY,
  AGENT_ACTIVITY_HEATMAP_QUERY,
  AGENT_WORKLOAD_DISTRIBUTION_QUERY,
  ACTIVITY_TREND_QUERY,
} from "@agentcenter/graphql-client";
import { STATUS_HEX_COLORS } from "@agentcenter/utils";

// --------------- types ---------------
interface TaskStatusCounts {
  inbox: number;
  assigned: number;
  inProgress: number;
  review: number;
  done: number;
  blocked: number;
  total: number;
}

interface CycleTimes {
  avgCycleTimeMs: number;
  medianCycleTimeMs: number;
  completedCount: number;
}

interface AgentProductivity {
  agentId: string;
  agentName: string;
  tasksAssigned: number;
  tasksCompleted: number;
  deliverablesCount: number;
  totalWorkTimeMs: number;
  queueCompletionRate: number;
}

interface TrendPoint {
  date: string;
  count: number;
}

interface ReviewMetrics {
  approved: number;
  rejected: number;
  clarification: number;
}

interface HeatmapCell {
  dayOfWeek: number; // 0=Sun … 6=Sat
  hour: number;      // 0-23
  count: number;
}

interface WorkloadEntry {
  agentId: string;
  agentName: string;
  inbox: number;
  assigned: number;
  inProgress: number;
  review: number;
  done: number;
  blocked: number;
}

// --------------- helpers ---------------

function fmtMs(ms: number): string {
  if (!ms || ms <= 0) return "—";
  const hours = ms / 3600000;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  return `${days.toFixed(1)}d`;
}

function fmtPct(rate: number): string {
  return `${Math.round((rate ?? 0) * 100)}%`;
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// --------------- sub-components ---------------

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Show 6 hour buckets: 0-3, 4-7, 8-11, 12-15, 16-19, 20-23
const HOUR_BUCKETS = [0, 4, 8, 12, 16, 20];
const HOUR_LABELS = ["12a", "4a", "8a", "12p", "4p", "8p"];

function ActivityHeatmap({ cells }: { cells: HeatmapCell[] }) {
  // Build lookup: dayOfWeek → hourBucket → count
  const lookup: Record<number, Record<number, number>> = {};
  for (const cell of cells) {
    const bucket = HOUR_BUCKETS.findIndex((h, i) => cell.hour >= h && (i === HOUR_BUCKETS.length - 1 || cell.hour < HOUR_BUCKETS[i + 1]));
    if (bucket === -1) continue;
    if (!lookup[cell.dayOfWeek]) lookup[cell.dayOfWeek] = {};
    lookup[cell.dayOfWeek][bucket] = (lookup[cell.dayOfWeek][bucket] ?? 0) + cell.count;
  }

  const maxCount = Math.max(1, ...cells.map((c) => c.count));

  return (
    <View className="gap-1">
      {/* Hour labels */}
      <View className="flex-row ml-8">
        {HOUR_LABELS.map((label) => (
          <Text key={label} className="flex-1 text-xs text-gray-400 dark:text-slate-500 text-center">{label}</Text>
        ))}
      </View>
      {/* Grid rows */}
      {DAY_LABELS.map((day, dayIdx) => (
        <View key={day} className="flex-row items-center gap-0.5">
          <Text className="w-8 text-xs text-gray-400 dark:text-slate-500">{day}</Text>
          {HOUR_BUCKETS.map((_, bucketIdx) => {
            const count = lookup[dayIdx]?.[bucketIdx] ?? 0;
            const intensity = count / maxCount;
            return (
              <View
                key={bucketIdx}
                className="flex-1 h-3.5 rounded"
                style={{
                  backgroundColor: count === 0
                    ? undefined
                    : `rgba(37, 99, 235, ${Math.max(0.12, intensity * 0.9)})`,
                }}
              >
                {count === 0 && <View className="flex-1 bg-gray-100 dark:bg-slate-700 rounded" />}
              </View>
            );
          })}
        </View>
      ))}
      <Text className="text-xs text-gray-400 dark:text-slate-500 mt-1 text-right">
        Darker = more agent actions
      </Text>
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <Text className="text-sm font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wide mb-2.5">
      {title}
    </Text>
  );
}

function MetricCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <View className="flex-1 bg-white dark:bg-slate-800 rounded-xl p-3.5 border border-gray-200 dark:border-slate-700 gap-0.5">
      <Text
        className="text-xl font-bold text-gray-900 dark:text-slate-100"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </Text>
      <Text className="text-xs font-semibold text-gray-900 dark:text-slate-100">{label}</Text>
      {sub ? <Text className="text-xs text-gray-400 dark:text-slate-500">{sub}</Text> : null}
    </View>
  );
}

function StatusBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? count / total : 0;
  return (
    <View className="gap-1">
      <View className="flex-row justify-between">
        <Text className="text-xs font-medium text-gray-900 dark:text-slate-100 capitalize">
          {label.replace("inProgress", "In Progress")}
        </Text>
        <Text className="text-xs text-gray-400 dark:text-slate-500">
          {count} ({Math.round(pct * 100)}%)
        </Text>
      </View>
      <View className="h-1.5 rounded bg-gray-100 dark:bg-slate-700 overflow-hidden">
        <View style={{ height: 6, width: `${Math.round(pct * 100)}%`, backgroundColor: color, borderRadius: 3 }} />
      </View>
    </View>
  );
}

function TrendChart({ data }: { data: TrendPoint[] }) {
  if (!data.length) return null;
  const max = Math.max(...data.map((d) => d.count), 1);
  const barWidth = Math.max(20, Math.floor(300 / data.length) - 4);

  return (
    <View className="gap-2">
      <View className="flex-row items-end gap-1 h-20">
        {data.map((point) => {
          const h = Math.max(4, Math.round((point.count / max) * 72));
          return (
            <View key={point.date} className="flex-1 items-center gap-0.5">
              <Text className="text-xs text-gray-400 dark:text-slate-500">
                {point.count > 0 ? point.count : ""}
              </Text>
              <View
                className="bg-blue-600 rounded opacity-85"
                style={{ width: barWidth, height: h }}
              />
            </View>
          );
        })}
      </View>
      <View className="flex-row gap-1">
        {data.map((point) => (
          <Text key={point.date} className="flex-1 text-xs text-gray-400 dark:text-slate-500 text-center">
            {fmtDate(point.date)}
          </Text>
        ))}
      </View>
    </View>
  );
}

// --------------- screen ---------------

const DAYS_OPTIONS = [7, 14, 30] as const;
type Days = (typeof DAYS_OPTIONS)[number];

export default function AnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const [days, setDays] = useState<Days>(14);
  const [refreshing, setRefreshing] = useState(false);

  const vars = { days };
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [statusResult, refetchStatus] = useQuery<{ taskStatusCounts: TaskStatusCounts }>({
    query: TASK_STATUS_COUNTS_QUERY,
    requestPolicy: "cache-and-network",
    pause: !mounted,
  });

  const [cycleResult, refetchCycle] = useQuery<{ taskCycleTimes: CycleTimes }>({
    query: TASK_CYCLE_TIMES_QUERY,
    requestPolicy: "cache-and-network",
    pause: !mounted,
  });

  const [productivityResult, refetchProductivity] = useQuery<{ agentProductivity: AgentProductivity[] }>({
    query: AGENT_PRODUCTIVITY_QUERY,
    requestPolicy: "cache-and-network",
    pause: !mounted,
  });

  const [trendResult, refetchTrend] = useQuery<{ taskCompletionTrend: TrendPoint[] }>({
    query: TASK_COMPLETION_TREND_QUERY,
    variables: vars,
    requestPolicy: "cache-and-network",
    pause: !mounted,
  });

  const [reviewResult, refetchReview] = useQuery<{ reviewMetrics: ReviewMetrics }>({
    query: REVIEW_METRICS_QUERY,
    requestPolicy: "cache-and-network",
    pause: !mounted,
  });

  const [heatmapResult, refetchHeatmap] = useQuery<{ agentActivityHeatmap: HeatmapCell[] }>({
    query: AGENT_ACTIVITY_HEATMAP_QUERY,
    variables: { days: 30 },
    requestPolicy: "cache-and-network",
    pause: !mounted,
  });

  const [workloadResult, refetchWorkload] = useQuery<{ agentWorkloadDistribution: WorkloadEntry[] }>({
    query: AGENT_WORKLOAD_DISTRIBUTION_QUERY,
    requestPolicy: "cache-and-network",
    pause: !mounted,
  });

  const [activityTrendResult, refetchActivityTrend] = useQuery<{ activityTrend: TrendPoint[] }>({
    query: ACTIVITY_TREND_QUERY,
    variables: vars,
    requestPolicy: "cache-and-network",
    pause: !mounted,
  });

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    const opts = { requestPolicy: "network-only" as const };
    refetchStatus(opts);
    refetchCycle(opts);
    refetchProductivity(opts);
    refetchTrend(opts);
    refetchReview(opts);
    refetchHeatmap(opts);
    refetchWorkload(opts);
    refetchActivityTrend(opts);
    setTimeout(() => setRefreshing(false), 1200);
  }, [refetchStatus, refetchCycle, refetchProductivity, refetchTrend, refetchReview, refetchHeatmap, refetchWorkload, refetchActivityTrend]);

  const status = statusResult.data?.taskStatusCounts;
  const cycle = cycleResult.data?.taskCycleTimes;
  const agents = productivityResult.data?.agentProductivity ?? [];
  const trend = trendResult.data?.taskCompletionTrend ?? [];
  const review = reviewResult.data?.reviewMetrics;
  const heatmapCells = heatmapResult.data?.agentActivityHeatmap ?? [];
  const workload = workloadResult.data?.agentWorkloadDistribution ?? [];
  const activityTrend = activityTrendResult.data?.activityTrend ?? [];

  const isLoading =
    statusResult.fetching && !status &&
    cycleResult.fetching && !cycle;

  const hasError = !!(statusResult.error && !status && cycleResult.error && !cycle);

  if (isLoading) return <ScreenLoading />;
  if (hasError) return <ScreenError message="Failed to load analytics" onRetry={onRefresh} />;

  const reviewTotal = (review?.approved ?? 0) + (review?.rejected ?? 0) + (review?.clarification ?? 0);

  return (
    <ScrollView
      className="flex-1 bg-white dark:bg-slate-900"
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 24 }}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#2563eb"
        />
      }
    >
      {/* ── Cycle Time KPIs ── */}
      <View className="gap-2.5">
        <SectionTitle title="Cycle Time" />
        <View className="flex-row gap-2.5">
          <MetricCard
            label="Avg Cycle Time"
            value={cycle ? fmtMs(cycle.avgCycleTimeMs) : "—"}
            sub="task creation → done"
          />
          <MetricCard
            label="Median"
            value={cycle ? fmtMs(cycle.medianCycleTimeMs) : "—"}
            sub={`${cycle?.completedCount ?? 0} completed`}
          />
        </View>
      </View>

      {/* ── Task Status Distribution ── */}
      {status && (
        <View className="gap-2.5">
          <SectionTitle title={`Task Status (${status.total} total)`} />
          <View className="bg-white dark:bg-slate-800 rounded-xl p-3.5 border border-gray-200 dark:border-slate-700 gap-3">
            {(["inbox", "assigned", "inProgress", "review", "done", "blocked"] as const).map((key) => (
              <StatusBar
                key={key}
                label={key}
                count={status[key]}
                total={status.total}
                color={STATUS_HEX_COLORS[key]}
              />
            ))}
          </View>
        </View>
      )}

      {/* ── Completion Trend ── */}
      <View className="gap-2.5">
        <View className="flex-row justify-between items-center">
          <SectionTitle title="Completion Trend" />
          <View className="flex-row gap-1.5">
            {DAYS_OPTIONS.map((d) => (
              <TouchableOpacity
                key={d}
                onPress={() => setDays(d)}
                className={`px-2.5 py-1 rounded-md ${days === d ? "bg-blue-600" : "bg-gray-100 dark:bg-slate-700"}`}
                activeOpacity={0.7}
              >
                <Text className={`text-xs font-semibold ${days === d ? "text-white" : "text-gray-500 dark:text-slate-400"}`}>
                  {d}d
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View className="bg-white dark:bg-slate-800 rounded-xl p-3.5 border border-gray-200 dark:border-slate-700">
          {trendResult.fetching && !trend.length ? (
            <ActivityIndicator color="#2563eb" />
          ) : trend.length === 0 ? (
            <Text className="text-gray-400 dark:text-slate-500 text-sm text-center">No data</Text>
          ) : (
            <TrendChart data={trend} />
          )}
        </View>
      </View>

      {/* ── Review Outcome ── */}
      {review && reviewTotal > 0 && (
        <View className="gap-2.5">
          <SectionTitle title="Review Outcomes" />
          <View className="flex-row gap-2.5">
            <MetricCard
              label="Approved"
              value={String(review.approved)}
              sub={fmtPct(review.approved / reviewTotal)}
              accent="#16a34a"
            />
            <MetricCard
              label="Rejected"
              value={String(review.rejected)}
              sub={fmtPct(review.rejected / reviewTotal)}
              accent="#dc2626"
            />
            <MetricCard
              label="Clarification"
              value={String(review.clarification)}
              sub={fmtPct(review.clarification / reviewTotal)}
              accent="#d97706"
            />
          </View>
        </View>
      )}

      {/* ── Agent Productivity ── */}
      {agents.length > 0 && (
        <View className="gap-2.5">
          <SectionTitle title="Agent Productivity" />
          <View className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            {/* Table header */}
            <View className="flex-row px-3 py-2 bg-gray-100 dark:bg-slate-700">
              <Text className="flex-1 text-xs font-bold text-gray-400 dark:text-slate-500">Agent</Text>
              <Text className="w-11 text-xs font-bold text-gray-400 dark:text-slate-500 text-right">Done</Text>
              <Text className="w-11 text-xs font-bold text-gray-400 dark:text-slate-500 text-right">Rate</Text>
              <Text className="w-11 text-xs font-bold text-gray-400 dark:text-slate-500 text-right">Deliv</Text>
            </View>
            {agents
              .slice()
              .sort((a, b) => b.tasksCompleted - a.tasksCompleted)
              .map((agent, i) => (
                <View
                  key={agent.agentId}
                  className="flex-row items-center px-3 py-2.5"
                  style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: "#f3f4f6" }}
                >
                  <Text className="flex-1 text-sm font-medium text-gray-900 dark:text-slate-100" numberOfLines={1}>
                    {agent.agentName}
                  </Text>
                  <Text className="w-11 text-sm text-gray-900 dark:text-slate-100 text-right">
                    {agent.tasksCompleted}
                  </Text>
                  <Text
                    className="w-11 text-xs text-right font-semibold"
                    style={{
                      color: agent.queueCompletionRate >= 0.8 ? "#16a34a" : agent.queueCompletionRate >= 0.5 ? "#d97706" : "#dc2626",
                    }}
                  >
                    {fmtPct(agent.queueCompletionRate)}
                  </Text>
                  <Text className="w-11 text-sm text-gray-400 dark:text-slate-500 text-right">
                    {agent.deliverablesCount}
                  </Text>
                </View>
              ))}
          </View>
        </View>
      )}

      {/* ── Activity Heatmap ── */}
      {heatmapCells.length > 0 && (
        <View className="gap-2.5">
          <SectionTitle title="Activity Heatmap (last 30 days)" />
          <View className="bg-white dark:bg-slate-800 rounded-xl p-3.5 border border-gray-200 dark:border-slate-700">
            <ActivityHeatmap cells={heatmapCells} />
          </View>
        </View>
      )}

      {/* ── Activity Trend ── */}
      <View className="gap-2.5">
        <View className="flex-row justify-between items-center">
          <SectionTitle title="Activity Trend" />
          <View className="flex-row gap-1.5">
            {DAYS_OPTIONS.map((d) => (
              <TouchableOpacity
                key={d}
                onPress={() => setDays(d)}
                className={`px-2.5 py-1 rounded-md ${days === d ? "bg-blue-600" : "bg-gray-100 dark:bg-slate-700"}`}
                activeOpacity={0.7}
              >
                <Text className={`text-xs font-semibold ${days === d ? "text-white" : "text-gray-500 dark:text-slate-400"}`}>
                  {d}d
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View className="bg-white dark:bg-slate-800 rounded-xl p-3.5 border border-gray-200 dark:border-slate-700">
          {activityTrendResult.fetching && !activityTrend.length ? (
            <ActivityIndicator color="#2563eb" />
          ) : activityTrend.length === 0 ? (
            <Text className="text-gray-400 dark:text-slate-500 text-sm text-center">No data</Text>
          ) : (
            <TrendChart data={activityTrend} />
          )}
        </View>
      </View>

      {/* ── Agent Workload Distribution ── */}
      {workload.length > 0 && (
        <View className="gap-2.5">
          <SectionTitle title="Agent Workload" />
          <View className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            {/* Table header */}
            <View className="flex-row px-3 py-2 bg-gray-100 dark:bg-slate-700">
              <Text className="flex-1 text-xs font-bold text-gray-400 dark:text-slate-500">Agent</Text>
              <Text className="w-9 text-xs font-bold text-gray-400 dark:text-slate-500 text-right">📥</Text>
              <Text className="w-9 text-xs font-bold text-gray-400 dark:text-slate-500 text-right">🔄</Text>
              <Text className="w-9 text-xs font-bold text-gray-400 dark:text-slate-500 text-right">🔍</Text>
              <Text className="w-9 text-xs font-bold text-gray-400 dark:text-slate-500 text-right">✅</Text>
            </View>
            {workload
              .slice()
              .sort((a, b) => (b.assigned + b.inProgress + b.review) - (a.assigned + a.inProgress + a.review))
              .map((entry, i) => {
                const active = entry.assigned + entry.inProgress + entry.review;
                return (
                  <View
                    key={entry.agentId}
                    className="flex-row items-center px-3 py-2.5"
                    style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: "#f3f4f6" }}
                  >
                    <View className="flex-1 gap-1">
                      <Text className="text-sm font-medium text-gray-900 dark:text-slate-100" numberOfLines={1}>
                        {entry.agentName}
                      </Text>
                      {/* Mini stacked bar */}
                      <View className="h-1 rounded-sm flex-row overflow-hidden bg-gray-100 dark:bg-slate-700">
                        {active > 0 && (
                          <>
                            <View style={{ flex: entry.assigned, backgroundColor: "#2563eb" }} />
                            <View style={{ flex: entry.inProgress, backgroundColor: "#d97706" }} />
                            <View style={{ flex: entry.review, backgroundColor: "#7c3aed" }} />
                          </>
                        )}
                      </View>
                    </View>
                    <Text className="w-9 text-xs text-gray-400 dark:text-slate-500 text-right">{entry.inbox}</Text>
                    <Text className="w-9 text-xs text-right font-semibold" style={{ color: "#d97706" }}>{entry.inProgress}</Text>
                    <Text className="w-9 text-xs text-right font-semibold" style={{ color: "#7c3aed" }}>{entry.review}</Text>
                    <Text className="w-9 text-xs text-right" style={{ color: "#16a34a" }}>{entry.done}</Text>
                  </View>
                );
              })}
            {/* Legend */}
            <View className="flex-row gap-3 px-3 py-2 bg-gray-100 dark:bg-slate-700 flex-wrap">
              {[
                { color: "#2563eb", label: "Assigned" },
                { color: "#d97706", label: "In Progress" },
                { color: "#7c3aed", label: "Review" },
              ].map(({ color, label }) => (
                <View key={label} className="flex-row items-center gap-1">
                  <View className="w-2 h-2 rounded-sm" style={{ backgroundColor: color }} />
                  <Text className="text-xs text-gray-400 dark:text-slate-500">{label}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}
