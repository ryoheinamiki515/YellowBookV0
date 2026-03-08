import type { Query, QueryClient } from "@tanstack/react-query";

function queryMatchesPrefix(query: Query, prefix: string) {
    const firstKey = query.queryKey[0];
    return (
        typeof firstKey === "string" &&
        (firstKey === prefix || firstKey.startsWith(`${prefix}/`))
    );
}

function invalidateQueryPrefix(queryClient: QueryClient, prefix: string) {
    return queryClient.invalidateQueries({
        predicate: (query) => queryMatchesPrefix(query, prefix),
    });
}

export function invalidatePlanQueries(queryClient: QueryClient) {
    return invalidateQueryPrefix(queryClient, "/v1/plans");
}

export function invalidatePeopleQueries(queryClient: QueryClient) {
    return invalidateQueryPrefix(queryClient, "/v1/people");
}
