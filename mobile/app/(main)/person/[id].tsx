import React from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { PageContainer } from "../../../src/components/PageContainer";
import { PersonDetailContent } from "../../../src/components/PersonDetailContent";

export default function PersonDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FBF8F3" }}>
            <PageContainer backgroundColor="$background">
                <PersonDetailContent
                    personId={id!}
                    onClose={() => router.back()}
                />
            </PageContainer>
        </SafeAreaView>
    );
}
