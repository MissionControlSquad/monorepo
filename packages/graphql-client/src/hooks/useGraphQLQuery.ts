import { useQuery as useUrqlQuery } from "urql";
import type { AnyVariables, DocumentInput, UseQueryArgs } from "urql";

/**
 * Wrapper around urql's useQuery with simplified return shape.
 * Returns the data directly (or undefined while loading), plus loading/error states.
 * Works in React (web/Electron) and React Native.
 */
export function useGraphQLQuery<Data = unknown, Variables extends AnyVariables = AnyVariables>(
  query: DocumentInput<Data, Variables>,
  variables: Variables,
  options?: { pause?: boolean },
) {
  const [result] = useUrqlQuery<Data, Variables>({
    query,
    variables,
    pause: options?.pause,
  } as UseQueryArgs<Variables, Data>);

  return {
    data: result.data,
    loading: result.fetching,
    error: result.error,
    stale: result.stale,
  };
}
