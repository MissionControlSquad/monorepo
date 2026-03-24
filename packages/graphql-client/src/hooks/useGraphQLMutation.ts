import { useMutation as useUrqlMutation } from "urql";
import type { AnyVariables, DocumentInput } from "urql";

/**
 * Wrapper around urql's useMutation.
 * Returns { execute, data, loading, error }.
 * Works in React (web/Electron) and React Native.
 */
export function useGraphQLMutation<Data = unknown, Variables extends AnyVariables = AnyVariables>(
  mutation: DocumentInput<Data, Variables>,
) {
  const [result, executeMutation] = useUrqlMutation<Data, Variables>(mutation);

  return {
    execute: executeMutation,
    data: result.data,
    loading: result.fetching,
    error: result.error,
  };
}
