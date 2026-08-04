import { gql } from "urql";
export const CLOUD_UPSTREAMS_QUERY = gql`query CloudUpstreams($projectId: String) { cloudUpstreams(projectId: $projectId) { id projectId name remoteUrl remoteRef syncState ahead behind lastError lastSyncedAt } }`;
export const CLOUD_UPSTREAM_PLAN_QUERY = gql`query CloudUpstreamPlan($id: String!) { cloudUpstreamPlan(id: $id) { state action reason needsReconcile } }`;
