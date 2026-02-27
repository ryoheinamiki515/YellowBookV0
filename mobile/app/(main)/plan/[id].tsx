import React from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { PageContainer } from "../../../src/components/PageContainer";
import { PlanDetailContent } from "../../../src/components/plans/PlanDetailContent";

export default function PlanDetailScreen() {
    const { id, focus } = useLocalSearchParams<{
        id: string;
        focus?: string | string[];
    }>();
    const router = useRouter();
    const focusTarget = Array.isArray(focus) ? focus[0] : focus;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FBF8F3" }}>
            <PageContainer backgroundColor="$background">
                <PlanDetailContent
                    planId={id!}
                    focusTarget={focusTarget}
                    onClose={() => router.back()}
                />
            </PageContainer>
        </SafeAreaView>
    );
}
