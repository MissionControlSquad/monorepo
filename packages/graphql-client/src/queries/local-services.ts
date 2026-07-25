import { gql } from "urql";
export const LOCAL_SERVICES_QUERY = gql`query LocalServices($status:String){ localServices(status:$status){ id key kind status pid restartCount lastError lastHealthyAt } }`;
