import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
    getGetMeQueryKey,
    usePatchMe,
} from "../api/generated/system/system";

export function useSaveDisplayName() {
    const queryClient = useQueryClient();
    const patchMe = usePatchMe();

    const saveDisplayName = useCallback(
        async (rawDisplayName: string) => {
            const displayName = rawDisplayName.trim();
            if (!displayName) {
                throw new Error("display_name_required");
            }

            await patchMe.mutateAsync({ data: { displayName } });
            await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
            return displayName;
        },
        [patchMe, queryClient]
    );

    return {
        saveDisplayName,
        isPending: patchMe.isPending,
        error: patchMe.error ?? null,
    };
}
