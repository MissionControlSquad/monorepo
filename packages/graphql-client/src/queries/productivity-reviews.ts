import { gql } from "urql";
export const FLAGGED_AGENTS_QUERY = gql`query FlaggedAgents { flaggedAgents { id agentId verdict score reasons } }`;
