"use client";

import { useSubscription as useUrqlSubscription } from "urql";
import type { AnyVariables, DocumentInput } from "urql";

/**
 * Wrapper around urql's useSubscription for real-time data.
 */
export function useGraphQLSubscription<
  Data = unknown,
  Variables extends AnyVariables = AnyVariables,
>(
  subscription: DocumentInput<Data, Variables>,
  variables: Variables,
  options?: { pause?: boolean },
) {
  const [result] = useUrqlSubscription<Data, unknown, Variables>({
    query: subscription,
    variables,
    pause: options?.pause,
  });

  return {
    data: result.data,
    loading: result.fetching,
    error: result.error,
  };
}
