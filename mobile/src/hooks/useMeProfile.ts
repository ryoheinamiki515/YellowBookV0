import { useMemo } from "react";

import { useGetMe } from "../api/generated/system/system";
import { useAuth } from "../context/AuthContext";

type MeProfile = {
    id: string;
    authSubject: string;
    displayName?: string | null;
    birthday?: { month: number; day: number; year?: number | null } | null;
    profileImageUrl?: string | null;
};

export function useMeProfile() {
    const { hasToken } = useAuth();
    const query = useGetMe({
        query: {
            enabled: hasToken,
            retry: false,
        },
    });

    const me = useMemo(() => {
        if (!query.data?.data || !("data" in query.data.data)) {
            return null;
        }

        return (query.data.data as { data: MeProfile }).data;
    }, [query.data]);

    const displayName = me?.displayName?.trim() || null;

    return {
        ...query,
        me,
        displayName,
        hasCompletedProfile: Boolean(displayName),
        isLoading: hasToken ? query.isLoading || query.isPending : false,
        error: query.error ?? null,
    };
}
