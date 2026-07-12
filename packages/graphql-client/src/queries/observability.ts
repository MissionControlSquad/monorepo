import { gql } from "urql";

// Epic #13: workspace observability summary.
export const WORKSPACE_SUMMARY_QUERY = gql`
  query WorkspaceSummary {
    workspaceSummary {
      agents {
        total
        operational
        blocked
        idle
        active
      }
      tasks {
        total
        open
        inProgress
        review
        blocked
        done
      }
      monthSpendCents
      pendingApprovals
      activeBudgetIncidents
    }
  }
`;
