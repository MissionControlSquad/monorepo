import { gql } from "urql";
export const UPSERT_ADAPTER_PLUGIN = gql`mutation UpsertAdapterPlugin($key:String!,$base:String!,$template:[String!]!,$displayName:String,$models:[String!],$supportsModel:Boolean,$enabled:Boolean){ upsertAdapterPlugin(key:$key,base:$base,template:$template,displayName:$displayName,models:$models,supportsModel:$supportsModel,enabled:$enabled){ id key enabled } }`;
export const DELETE_ADAPTER_PLUGIN = gql`mutation DeleteAdapterPlugin($key:String!){ deleteAdapterPlugin(key:$key) }`;
