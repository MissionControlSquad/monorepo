import { gql } from "urql";

// Per-member analytics — a profile's contribution + cost within the workspace.
export const PROFILE_ANALYTICS_QUERY = gql`
  query ProfileAnalytics($profileId: String!) {
    profileAnalytics(profileId: $profileId) {
      profileId
      displayName
      kind
      agentId
      tasksAssigned
      tasksCompleted
      completionRate
      tasksCreated
      activityCount
      cost {
        totalTokensIn
        totalTokensOut
        totalSpendCents
        byModel {
          model
          tokensIn
          tokensOut
          spendCents
        }
      }
    }
  }
`;
