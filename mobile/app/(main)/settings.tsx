import React from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { PageContainer } from "../../src/components/PageContainer";
import { MeDetailContent } from "../../src/components/MeDetailContent";

export default function SettingsScreen() {
    const router = useRouter();

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FBF8F3" }}>
            <PageContainer backgroundColor="$background">
                <MeDetailContent onClose={() => router.back()} />
            </PageContainer>
        </SafeAreaView>
    );
}
