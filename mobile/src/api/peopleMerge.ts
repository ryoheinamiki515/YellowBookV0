import {
    useMutation,
    type QueryClient,
    type UseMutationOptions,
    type UseMutationResult,
} from "@tanstack/react-query";
import type {
    BadRequestResponse,
    ConflictResponse,
    NotFoundResponse,
    PersonResponse,
    UnauthorizedResponse,
} from "./generated/model";
import { customFetch } from "./customFetch";

type MergePersonRequest = {
    sourcePersonId: string;
};

export type MergePersonResponse = {
    data: PersonResponse;
    status: 200;
    headers: Headers;
};

export async function mergePerson(
    personId: string,
    data: MergePersonRequest,
    options?: RequestInit
): Promise<MergePersonResponse> {
    return customFetch<MergePersonResponse>(`/v1/people/${personId}/merge`, {
        ...options,
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...options?.headers,
        },
        body: JSON.stringify(data),
    });
}

export function useMergePerson<
    TError =
        | BadRequestResponse
        | UnauthorizedResponse
        | NotFoundResponse
        | ConflictResponse,
    TContext = unknown,
>(
    options?: {
        mutation?: UseMutationOptions<
            MergePersonResponse,
            TError,
            { personId: string; data: MergePersonRequest },
            TContext
        >;
        request?: RequestInit;
    },
    queryClient?: QueryClient
): UseMutationResult<
    MergePersonResponse,
    TError,
    { personId: string; data: MergePersonRequest },
    TContext
> {
    return useMutation(
        {
            mutationKey: ["mergePerson"],
            mutationFn: ({ personId, data }) =>
                mergePerson(personId, data, options?.request),
            ...options?.mutation,
        },
        queryClient
    );
}
