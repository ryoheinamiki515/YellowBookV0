import React from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { PageContainer } from "../../../src/components/PageContainer";
import { PersonDetailContent } from "../../../src/components/PersonDetailContent";

export default function PersonDetailScreen() {
    const { id, returnTo } = useLocalSearchParams<{
        id: string;
        returnTo?: string | string[];
    }>();
    const router = useRouter();
    const resolvedReturnTo = Array.isArray(returnTo) ? returnTo[0] : returnTo;
    const closeHref =
        typeof resolvedReturnTo === "string" && resolvedReturnTo.startsWith("/")
            ? resolvedReturnTo
            : "/people";

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FBF8F3" }}>
            <PageContainer backgroundColor="$background">
                <PersonDetailContent
                    personId={id!}
                    onClose={() => router.replace(closeHref as any)}
                />
            </PageContainer>
        </SafeAreaView>
    );
}
