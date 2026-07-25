import { gql } from "urql";
export const CREATE_SMOKE_CASE = gql`mutation CreateSmokeCase($name:String!,$toolName:String!,$expectDecision:String!,$agentId:String,$inputText:String){ createSmokeCase(name:$name,toolName:$toolName,expectDecision:$expectDecision,agentId:$agentId,inputText:$inputText){ id name } }`;
export const DELETE_SMOKE_CASE = gql`mutation DeleteSmokeCase($id:String!){ deleteSmokeCase(id:$id) }`;
export const RUN_SMOKE_CASE = gql`mutation RunSmokeCase($id:String!){ runSmokeCase(id:$id){ caseId name result expected actual detail } }`;
export const RUN_SMOKE_SUITE = gql`mutation RunSmokeSuite { runSmokeSuite { passed failed errored results { name result expected actual } } }`;
