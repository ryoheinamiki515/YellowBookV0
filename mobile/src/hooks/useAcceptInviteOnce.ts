import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";

import {
    getListConnectionsQueryKey,
    useAcceptConnectionInvite,
} from "../api/generated/connections/connections";
import { getListPeopleQueryKey } from "../api/generated/people/people";
import { getProblemDetail } from "../lib/problemDetails";

export type InviteAcceptStatus = "loading" | "success" | "error";

export type UseAcceptInviteOnceResult = {
    status: InviteAcceptStatus;
    errorMessage: string;
};

export function useAcceptInviteOnce({
    token,
    isAuthenticated,
}: {
    token: string | undefined;
    isAuthenticated: boolean;
}): UseAcceptInviteOnceResult {
    const router = useRouter();
    const queryClient = useQueryClient();
    const acceptInvite = useAcceptConnectionInvite();
    const [status, setStatus] = useState<InviteAcceptStatus>("loading");
    const [errorMessage, setErrorMessage] = useState("");
    const attemptedTokenRef = useRef<string | null>(null);

    useEffect(() => {
        if (!isAuthenticated || !token) return;
        if (attemptedTokenRef.current === token) return;
        attemptedTokenRef.current = token;

        acceptInvite.mutate(
            { token },
            {
                onSuccess: () => {
                    void queryClient.invalidateQueries({
                        queryKey: getListPeopleQueryKey(),
                    });
                    void queryClient.invalidateQueries({
                        queryKey: getListConnectionsQueryKey(),
                    });
                    setStatus("success");
                    setTimeout(() => router.replace("/(main)/connections"), 1500);
                },
                onError: (error: any) => {
                    const detail = getProblemDetail(error);
                    if (detail.includes("display_name_required")) {
                        router.replace("/complete-profile");
                        return;
                    }

                    setStatus("error");
                    if (detail.includes("already_connected")) {
                        setErrorMessage("You're already connected!");
                    } else if (detail.includes("cannot_accept_own")) {
                        setErrorMessage("You can't accept your own invite.");
                    } else {
                        setErrorMessage("This invite link is invalid or expired.");
                    }
                },
            }
        );
    }, [isAuthenticated, token]);

    return { status, errorMessage };
}
