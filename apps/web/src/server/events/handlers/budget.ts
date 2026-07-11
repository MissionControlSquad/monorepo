/**
 * Budget breach handler (Epic #4). Keeps breach evaluation OFF the hot ingestion write:
 * `recordCostEvent` only inserts + atomically increments, then emits COST_EVENT_RECORDED;
 * this handler evaluates each touched policy for breach (mark breached, open one incident,
 * auto-pause when hardStop). Failures are isolated by the bus (Promise.allSettled).
 */
import { on } from "../bus";
import { EventTypes } from "../../constants";
import { checkBreach } from "../../services/budget-enforcement";

on(EventTypes.COST_EVENT_RECORDED, async (event) => {
  const at = new Date(event.occurredAt);
  for (const policyId of event.affectedPolicyIds) {
    await checkBreach(policyId, at);
  }
});
