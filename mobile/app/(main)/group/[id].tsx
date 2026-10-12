import React from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { PageContainer } from "../../../src/components/PageContainer";
import { GroupDetailContent } from "../../../src/components/GroupDetailContent";

export default function GroupDetailScreen() {
    const { id } = useLocalSearchParams<{
        id: string;
    }>();
    const router = useRouter();

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FBF8F3" }}>
            <PageContainer backgroundColor="$background">
                <GroupDetailContent
                    groupId={id!}
                    onClose={() => router.back()}
                />
            </PageContainer>
        </SafeAreaView>
    );
}
