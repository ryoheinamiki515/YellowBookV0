import React, { useCallback } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { PageContainer } from "../../../src/components/PageContainer";
import { PlanDetailContent } from "../../../src/components/plans/PlanDetailContent";
import { getGetPlanQueryKey } from "../../../src/api/generated/plans/plans";
import { useRefreshOnVisible } from "../../../src/hooks/useRefreshOnVisible";

export default function PlanDetailScreen() {
    const { id, focus } = useLocalSearchParams<{
        id: string;
        focus?: string | string[];
    }>();
    const router = useRouter();
    const queryClient = useQueryClient();
    const focusTarget = Array.isArray(focus) ? focus[0] : focus;

    const refreshPlan = useCallback(() => {
        if (!id) return Promise.resolve();

        return queryClient.invalidateQueries({
            queryKey: getGetPlanQueryKey(id),
        });
    }, [id, queryClient]);

    useRefreshOnVisible(refreshPlan);

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FBF8F3" }}>
            <PageContainer backgroundColor="$background">
                <PlanDetailContent
                    key={id}
                    planId={id!}
                    focusTarget={focusTarget}
                    onClose={() => router.back()}
                />
            </PageContainer>
        </SafeAreaView>
    );
}
