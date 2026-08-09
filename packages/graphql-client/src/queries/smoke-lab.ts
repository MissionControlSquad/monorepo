import { gql } from "urql";
export const SMOKE_CASES_QUERY = gql`query SmokeCases { smokeCases { id name toolName expectDecision lastResult lastActual lastRunAt } }`;
