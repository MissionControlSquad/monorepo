/**
 * Budget breach handler (Epic #4). Keeps breach evaluation OFF the hot ingestion write:
 * `recordCostEvent` only inserts + atomically increments, then emits COST_EVENT_RECORDED;
 * this handler evaluates each touched policy for breach (mark breached, open one incident,
 * auto-pause when hardStop). It also fans incident open/resolve to the per-workspace pubsub
 * topic so dashboards show live auto-pause. Failures are isolated by the bus (allSettled).
 */
import { on } from "../bus";
import { EventTypes } from "../../constants";
import { pubsub, budgetIncidentTopic } from "../../pubsub";
import { checkBreach } from "../../services/budget-enforcement";

on(EventTypes.COST_EVENT_RECORDED, async (event) => {
  const at = new Date(event.occurredAt);
  for (const policyId of event.affectedPolicyIds) {
    await checkBreach(policyId, at);
  }
});

on(EventTypes.BUDGET_INCIDENT_OPENED, async (event) => {
  pubsub.publish(budgetIncidentTopic(event.workspaceId), {
    incidentId: event.incidentId,
    workspaceId: event.workspaceId,
  });
});

on(EventTypes.BUDGET_INCIDENT_RESOLVED, async (event) => {
  pubsub.publish(budgetIncidentTopic(event.workspaceId), {
    incidentId: event.incidentId,
    workspaceId: event.workspaceId,
  });
});
