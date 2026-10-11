import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useDeleteMe } from "../api/generated/system/system";
import { useAuth } from "../context/AuthContext";
import { unregisterPushTokenForSignOut } from "../lib/pushTokenStorage";

export function useDeleteAccount() {
    const queryClient = useQueryClient();
    const deleteMe = useDeleteMe();
    const { signOut } = useAuth();

    const deleteAccount = useCallback(async () => {
        // Any authenticated request after deletion re-provisions an empty user
        // (requireUser upserts by Auth0 subject), so the push token — which
        // signOut would otherwise unregister — is released first.
        await unregisterPushTokenForSignOut();
        await deleteMe.mutateAsync();
        queryClient.clear();
        await signOut();
    }, [deleteMe, queryClient, signOut]);

    return { deleteAccount, isDeleting: deleteMe.isPending };
}
