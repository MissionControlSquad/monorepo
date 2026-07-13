import { gql } from "urql";

// Epic #20: unified attention feed.
export const ATTENTION_FEED_QUERY = gql`
  query AttentionFeed {
    attentionFeed {
      totalCount
      countsBySourceKind
      items {
        id
        sourceKind
        severity
        subjectKind
        subjectId
        title
        whyNow
        activityAt
      }
    }
  }
`;
