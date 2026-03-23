import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { useState, useCallback } from "react";
import { useQuery } from "urql";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  TASK_STATUS_COUNTS_QUERY,
  TASK_CYCLE_TIMES_QUERY,
  AGENT_PRODUCTIVITY_QUERY,
  TASK_COMPLETION_TREND_QUERY,
  REVIEW_METRICS_QUERY,
  AGENT_ACTIVITY_HEATMAP_QUERY,
} from "@agentcenter/graphql-client";
import { useTheme } from "../src/hooks/useTheme";

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

// --------------- helpers ---------------
const STATUS_COLORS: Record<string, string> = {
  inbox: "#6b7280",
  assigned: "#2563eb",
  inProgress: "#d97706",
  review: "#7c3aed",
  done: "#16a34a",
  blocked: "#dc2626",
};

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

function ActivityHeatmap({ cells, colors }: { cells: HeatmapCell[]; colors: ReturnType<typeof useTheme>["colors"] }) {
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
    <View style={{ gap: 4 }}>
      {/* Hour labels */}
      <View style={{ flexDirection: "row", marginLeft: 32 }}>
        {HOUR_LABELS.map((label) => (
          <Text key={label} style={{ flex: 1, fontSize: 9, color: colors.textMuted, textAlign: "center" }}>{label}</Text>
        ))}
      </View>
      {/* Grid rows */}
      {DAY_LABELS.map((day, dayIdx) => (
        <View key={day} style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          <Text style={{ width: 30, fontSize: 10, color: colors.textMuted }}>{day}</Text>
          {HOUR_BUCKETS.map((_, bucketIdx) => {
            const count = lookup[dayIdx]?.[bucketIdx] ?? 0;
            const intensity = count / maxCount;
            return (
              <View
                key={bucketIdx}
                style={{
                  flex: 1,
                  height: 14,
                  borderRadius: 3,
                  backgroundColor: count === 0
                    ? colors.surfaceAlt
                    : `rgba(37, 99, 235, ${Math.max(0.12, intensity * 0.9)})`,
                }}
              />
            );
          })}
        </View>
      ))}
      <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: 4, textAlign: "right" }}>
        Darker = more agent actions
      </Text>
    </View>
  );
}

function SectionTitle({ title, colors }: { title: string; colors: ReturnType<typeof useTheme>["colors"] }) {
  return (
    <Text style={{ fontSize: 13, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
      {title}
    </Text>
  );
}

function MetricCard({
  label,
  value,
  sub,
  accent,
  colors,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, gap: 2 }}>
      <Text style={{ fontSize: 22, fontWeight: "700", color: accent ?? colors.text, fontVariant: ["tabular-nums"] }}>
        {value}
      </Text>
      <Text style={{ fontSize: 12, fontWeight: "600", color: colors.text }}>{label}</Text>
      {sub ? <Text style={{ fontSize: 11, color: colors.textMuted }}>{sub}</Text> : null}
    </View>
  );
}

function StatusBar({
  label,
  count,
  total,
  color,
  colors,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const pct = total > 0 ? count / total : 0;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 12, fontWeight: "500", color: colors.text, textTransform: "capitalize" }}>
          {label.replace("inProgress", "In Progress")}
        </Text>
        <Text style={{ fontSize: 12, color: colors.textMuted, fontVariant: ["tabular-nums"] }}>
          {count} ({Math.round(pct * 100)}%)
        </Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: "hidden" }}>
        <View style={{ height: 6, width: `${Math.round(pct * 100)}%`, backgroundColor: color, borderRadius: 3 }} />
      </View>
    </View>
  );
}

function TrendChart({
  data,
  colors,
}: {
  data: TrendPoint[];
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  if (!data.length) return null;
  const max = Math.max(...data.map((d) => d.count), 1);
  const barWidth = Math.max(20, Math.floor(300 / data.length) - 4);

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4, height: 80 }}>
        {data.map((point) => {
          const h = Math.max(4, Math.round((point.count / max) * 72));
          return (
            <View key={point.date} style={{ flex: 1, alignItems: "center", gap: 2 }}>
              <Text style={{ fontSize: 9, color: colors.textMuted, fontVariant: ["tabular-nums"] }}>
                {point.count > 0 ? point.count : ""}
              </Text>
              <View
                style={{
                  width: barWidth,
                  height: h,
                  backgroundColor: colors.accent,
                  borderRadius: 3,
                  opacity: 0.85,
                }}
              />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", gap: 4 }}>
        {data.map((point) => (
          <Text key={point.date} style={{ flex: 1, fontSize: 9, color: colors.textMuted, textAlign: "center" }}>
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
  const { colors } = useTheme();
  const [days, setDays] = useState<Days>(14);
  const [refreshing, setRefreshing] = useState(false);

  const vars = { days };

  const [statusResult, refetchStatus] = useQuery<{ taskStatusCounts: TaskStatusCounts }>({
    query: TASK_STATUS_COUNTS_QUERY,
    requestPolicy: "cache-and-network",
  });

  const [cycleResult, refetchCycle] = useQuery<{ taskCycleTimes: CycleTimes }>({
    query: TASK_CYCLE_TIMES_QUERY,
    requestPolicy: "cache-and-network",
  });

  const [productivityResult, refetchProductivity] = useQuery<{ agentProductivity: AgentProductivity[] }>({
    query: AGENT_PRODUCTIVITY_QUERY,
    requestPolicy: "cache-and-network",
  });

  const [trendResult, refetchTrend] = useQuery<{ taskCompletionTrend: TrendPoint[] }>({
    query: TASK_COMPLETION_TREND_QUERY,
    variables: vars,
    requestPolicy: "cache-and-network",
  });

  const [reviewResult, refetchReview] = useQuery<{ reviewMetrics: ReviewMetrics }>({
    query: REVIEW_METRICS_QUERY,
    requestPolicy: "cache-and-network",
  });

  const [heatmapResult, refetchHeatmap] = useQuery<{ agentActivityHeatmap: HeatmapCell[] }>({
    query: AGENT_ACTIVITY_HEATMAP_QUERY,
    variables: { days: 30 },
    requestPolicy: "cache-and-network",
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
    setTimeout(() => setRefreshing(false), 1200);
  }, [refetchStatus, refetchCycle, refetchProductivity, refetchTrend, refetchReview, refetchHeatmap]);

  const status = statusResult.data?.taskStatusCounts;
  const cycle = cycleResult.data?.taskCycleTimes;
  const agents = productivityResult.data?.agentProductivity ?? [];
  const trend = trendResult.data?.taskCompletionTrend ?? [];
  const review = reviewResult.data?.reviewMetrics;
  const heatmapCells = heatmapResult.data?.agentActivityHeatmap ?? [];

  const isLoading =
    statusResult.fetching && !status &&
    cycleResult.fetching && !cycle;

  const hasError = !!(statusResult.error && !status && cycleResult.error && !cycle);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (hasError) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background, gap: 12, padding: 32 }}>
        <Text style={{ fontSize: 15, color: colors.danger, textAlign: "center" }}>Failed to load analytics</Text>
        <TouchableOpacity
          onPress={onRefresh}
          style={{ backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 }}
          activeOpacity={0.7}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const reviewTotal = (review?.approved ?? 0) + (review?.rejected ?? 0) + (review?.clarification ?? 0);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 24 }}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.accent}
        />
      }
    >
      {/* ── Cycle Time KPIs ── */}
      <View style={{ gap: 10 }}>
        <SectionTitle title="Cycle Time" colors={colors} />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <MetricCard
            label="Avg Cycle Time"
            value={cycle ? fmtMs(cycle.avgCycleTimeMs) : "—"}
            sub="task creation → done"
            colors={colors}
          />
          <MetricCard
            label="Median"
            value={cycle ? fmtMs(cycle.medianCycleTimeMs) : "—"}
            sub={`${cycle?.completedCount ?? 0} completed`}
            colors={colors}
          />
        </View>
      </View>

      {/* ── Task Status Distribution ── */}
      {status && (
        <View style={{ gap: 10 }}>
          <SectionTitle title={`Task Status (${status.total} total)`} colors={colors} />
          <View style={{ backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, gap: 12 }}>
            {(["inbox", "assigned", "inProgress", "review", "done", "blocked"] as const).map((key) => (
              <StatusBar
                key={key}
                label={key}
                count={status[key]}
                total={status.total}
                color={STATUS_COLORS[key]}
                colors={colors}
              />
            ))}
          </View>
        </View>
      )}

      {/* ── Completion Trend ── */}
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <SectionTitle title="Completion Trend" colors={colors} />
          <View style={{ flexDirection: "row", gap: 6 }}>
            {DAYS_OPTIONS.map((d) => (
              <TouchableOpacity
                key={d}
                onPress={() => setDays(d)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 6,
                  backgroundColor: days === d ? colors.accent : colors.surfaceAlt,
                }}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: days === d ? "#fff" : colors.textSecondary }}>
                  {d}d
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={{ backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border }}>
          {trendResult.fetching && !trend.length ? (
            <ActivityIndicator color={colors.accent} />
          ) : trend.length === 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: "center" }}>No data</Text>
          ) : (
            <TrendChart data={trend} colors={colors} />
          )}
        </View>
      </View>

      {/* ── Review Outcome ── */}
      {review && reviewTotal > 0 && (
        <View style={{ gap: 10 }}>
          <SectionTitle title="Review Outcomes" colors={colors} />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <MetricCard
              label="Approved"
              value={String(review.approved)}
              sub={fmtPct(review.approved / reviewTotal)}
              accent={colors.success}
              colors={colors}
            />
            <MetricCard
              label="Rejected"
              value={String(review.rejected)}
              sub={fmtPct(review.rejected / reviewTotal)}
              accent={colors.danger}
              colors={colors}
            />
            <MetricCard
              label="Clarification"
              value={String(review.clarification)}
              sub={fmtPct(review.clarification / reviewTotal)}
              accent={colors.warning}
              colors={colors}
            />
          </View>
        </View>
      )}

      {/* ── Agent Productivity ── */}
      {agents.length > 0 && (
        <View style={{ gap: 10 }}>
          <SectionTitle title="Agent Productivity" colors={colors} />
          <View style={{ backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
            {/* Table header */}
            <View style={{ flexDirection: "row", paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surfaceAlt }}>
              <Text style={{ flex: 1, fontSize: 11, fontWeight: "700", color: colors.textMuted }}>Agent</Text>
              <Text style={{ width: 44, fontSize: 11, fontWeight: "700", color: colors.textMuted, textAlign: "right" }}>Done</Text>
              <Text style={{ width: 44, fontSize: 11, fontWeight: "700", color: colors.textMuted, textAlign: "right" }}>Rate</Text>
              <Text style={{ width: 44, fontSize: 11, fontWeight: "700", color: colors.textMuted, textAlign: "right" }}>Deliv</Text>
            </View>
            {agents
              .slice()
              .sort((a, b) => b.tasksCompleted - a.tasksCompleted)
              .map((agent, i) => (
                <View
                  key={agent.agentId}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: colors.borderAlt,
                  }}
                >
                  <Text style={{ flex: 1, fontSize: 13, fontWeight: "500", color: colors.text }} numberOfLines={1}>
                    {agent.agentName}
                  </Text>
                  <Text style={{ width: 44, fontSize: 13, color: colors.text, textAlign: "right", fontVariant: ["tabular-nums"] }}>
                    {agent.tasksCompleted}
                  </Text>
                  <Text
                    style={{
                      width: 44,
                      fontSize: 12,
                      textAlign: "right",
                      fontVariant: ["tabular-nums"],
                      color: agent.queueCompletionRate >= 0.8 ? colors.success : agent.queueCompletionRate >= 0.5 ? colors.warning : colors.danger,
                      fontWeight: "600",
                    }}
                  >
                    {fmtPct(agent.queueCompletionRate)}
                  </Text>
                  <Text style={{ width: 44, fontSize: 13, color: colors.textMuted, textAlign: "right", fontVariant: ["tabular-nums"] }}>
                    {agent.deliverablesCount}
                  </Text>
                </View>
              ))}
          </View>
        </View>
      )}

      {/* ── Activity Heatmap ── */}
      {heatmapCells.length > 0 && (
        <View style={{ gap: 10 }}>
          <SectionTitle title="Activity Heatmap (last 30 days)" colors={colors} />
          <View style={{ backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border }}>
            <ActivityHeatmap cells={heatmapCells} colors={colors} />
          </View>
        </View>
      )}
    </ScrollView>
  );
}
