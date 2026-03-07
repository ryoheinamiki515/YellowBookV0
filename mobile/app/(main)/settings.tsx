import React, { useState, useCallback, useEffect } from "react";
import { Alert, Platform } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { YStack, XStack, Text, View } from "tamagui";

import { PageContainer } from "../../src/components/PageContainer";
import { DetailFooterAction } from "../../src/components/DetailFooterAction";
import { EditableText } from "../../src/components/EditableText";
import { useAuth } from "../../src/context/AuthContext";
import { useConfirm } from "../../src/components/ConfirmDialog";
import { useMeProfile } from "../../src/hooks/useMeProfile";
import { useSaveDisplayName } from "../../src/hooks/useSaveDisplayName";
import { getProblemDetail } from "../../src/lib/problemDetails";

export default function SettingsScreen() {
    const router = useRouter();
    const { signOut } = useAuth();
    const confirm = useConfirm();
    const { me } = useMeProfile();

    const [displayName, setDisplayName] = useState("");
    const { isPending, saveDisplayName } = useSaveDisplayName();

    useEffect(() => {
        setDisplayName(me?.displayName ?? "");
    }, [me?.displayName]);

    const handleSave = useCallback(async () => {
        if (!displayName.trim()) return;

        try {
            await saveDisplayName(displayName);
            if (Platform.OS !== "web") {
                Alert.alert("Saved", "Your display name has been updated.");
            }
        } catch (error) {
            if (Platform.OS !== "web") {
                Alert.alert(
                    "Error",
                    getProblemDetail(error) || "Could not save your display name."
                );
            }
        }
    }, [displayName, saveDisplayName]);

    const handleSignOut = useCallback(async () => {
        const confirmed = await confirm({
            title: "Sign out?",
            message: "You can always sign back in.",
            confirmLabel: "Sign Out",
            destructive: true,
        });
        if (confirmed) signOut();
    }, [signOut, confirm]);

    const hasChanges = displayName.trim() !== (me?.displayName ?? "");

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FBF8F3" }}>
            <PageContainer backgroundColor="$background">
                <YStack flex={1} paddingHorizontal="$6" paddingTop="$6">
                    <XStack alignItems="center" marginBottom="$6">
                        <Text
                            fontFamily="$body"
                            fontSize="$3"
                            color="$accentColor"
                            onPress={() => router.back()}
                            pressStyle={{ opacity: 0.7 }}
                            cursor="pointer"
                        >
                            Back
                        </Text>
                        <Text
                            fontFamily="$heading"
                            fontSize="$8"
                            color="$color"
                            flex={1}
                            textAlign="center"
                        >
                            Settings
                        </Text>
                        <View width={40} />
                    </XStack>

                    <YStack gap="$4">
                        <YStack gap="$3">
                            <Text
                                fontFamily="$body"
                                fontSize="$1"
                                fontWeight="700"
                                color="$colorTertiary"
                                textTransform="uppercase"
                                letterSpacing={1}
                            >
                                Display Name
                            </Text>
                            <YStack
                                backgroundColor="$backgroundStrong"
                                borderRadius="$4"
                                borderWidth={1}
                                borderColor="$borderColor"
                                paddingHorizontal="$4"
                                paddingVertical="$3"
                            >
                                <EditableText
                                    value={displayName}
                                    onChangeText={setDisplayName}
                                    placeholder="Your name"
                                />
                            </YStack>
                            <Text
                                fontFamily="$body"
                                fontSize="$2"
                                color="$colorTertiary"
                            >
                                Visible to your connections when you share plans.
                            </Text>
                        </YStack>

                        <DetailFooterAction
                            label="Save"
                            onPress={() => {
                                void handleSave();
                            }}
                            accessibilityLabel="Save display name"
                            tone="accent"
                            variant="filled"
                            disabled={!hasChanges || !displayName.trim() || isPending}
                        />
                    </YStack>

                    <YStack
                        marginTop="$6"
                        paddingTop="$4"
                        borderTopWidth={1}
                        borderTopColor="$borderColorSubtle"
                    >
                        <DetailFooterAction
                            label="Connections"
                            onPress={() => router.push("/connections" as any)}
                            accessibilityLabel="Manage connections"
                            tone="neutral"
                            variant="outline"
                        />
                    </YStack>

                    <YStack flex={1} />

                    <YStack paddingBottom="$6">
                        <DetailFooterAction
                            label="Sign Out"
                            onPress={handleSignOut}
                            accessibilityLabel="Sign out"
                            tone="danger"
                            variant="ghost"
                        />
                    </YStack>
                </YStack>
            </PageContainer>
        </SafeAreaView>
    );
}
