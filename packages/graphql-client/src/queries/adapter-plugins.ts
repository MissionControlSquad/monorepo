import { gql } from "urql";
export const ADAPTER_PLUGINS_QUERY = gql`query AdapterPlugins { adapterPlugins { id key displayName base models supportsModel enabled } }`;
