import { gql } from "urql";
export const DECISIONS_QUERY = gql`query Decisions($agentId:String,$decisionType:String){ decisions(agentId:$agentId,decisionType:$decisionType) }`;
