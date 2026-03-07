import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, YStack } from "tamagui";

import { DetailFooterAction } from "../src/components/DetailFooterAction";
import { PageContainer } from "../src/components/PageContainer";
import { AppTextInput } from "../src/components/AppTextInput";
import { useAuth } from "../src/context/AuthContext";
import { useMeProfile } from "../src/hooks/useMeProfile";
import { useSaveDisplayName } from "../src/hooks/useSaveDisplayName";
import { getResumablePendingPath } from "../src/lib/authFlowStorage";
import { getProblemDetail } from "../src/lib/problemDetails";

export default function CompleteProfileScreen() {
    const router = useRouter();
    const {
        clearPendingPath,
        clearProfileNameSuggestion,
        pendingPath,
        profileNameSuggestion,
        signOut,
    } = useAuth();
    const { me } = useMeProfile();
    const { isPending, saveDisplayName } = useSaveDisplayName();
    const [displayName, setDisplayName] = useState("");
    const [hasUserEdited, setHasUserEdited] = useState(false);
    const [saveError, setSaveError] = useState("");

    const seedDisplayName = useMemo(
        () => me?.displayName?.trim() || profileNameSuggestion || "",
        [me?.displayName, profileNameSuggestion]
    );
    const resumablePendingPath = useMemo(
        () => getResumablePendingPath(pendingPath),
        [pendingPath]
    );
    const helperCopy = resumablePendingPath?.startsWith("/invite/")
        ? "Choose the name your new connection will see. Saving will continue the invite automatically."
        : "Choose the name your connections will see when you share plans.";
    const trimmedDisplayName = displayName.trim();

    useEffect(() => {
        if (!hasUserEdited) {
            setDisplayName(seedDisplayName);
        }
    }, [hasUserEdited, seedDisplayName]);

    const handleSave = useCallback(async () => {
        setSaveError("");

        try {
            await saveDisplayName(displayName);
            await Promise.all([
                clearPendingPath(),
                clearProfileNameSuggestion(),
            ]);
            router.replace((resumablePendingPath ?? "/(main)/plans") as any);
        } catch (error) {
            setSaveError(
                getProblemDetail(error) || "Could not save your display name."
            );
        }
    }, [
        clearPendingPath,
        clearProfileNameSuggestion,
        displayName,
        resumablePendingPath,
        router,
        saveDisplayName,
    ]);

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FBF8F3" }}>
            <PageContainer backgroundColor="$background">
                <YStack flex={1} justifyContent="center" paddingHorizontal="$6" gap="$5">
                    <YStack gap="$2">
                        <Text fontFamily="$heading" fontSize="$10" color="$color">
                            Set your display name
                        </Text>
                        <Text fontFamily="$body" fontSize="$4" color="$colorSecondary">
                            {helperCopy}
                        </Text>
                    </YStack>

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
                            <AppTextInput
                                autoCapitalize="words"
                                autoCorrect={false}
                                onChangeText={(value) => {
                                    if (!hasUserEdited) {
                                        setHasUserEdited(true);
                                    }
                                    setDisplayName(value);
                                }}
                                onSubmitEditing={() => {
                                    if (trimmedDisplayName && !isPending) {
                                        void handleSave();
                                    }
                                }}
                                placeholder="Your name"
                                returnKeyType="done"
                                style={{
                                    color: "#2A2420",
                                    fontFamily: "System",
                                    fontSize: 18,
                                    padding: 0,
                                }}
                                value={displayName}
                            />
                        </YStack>
                        {saveError ? (
                            <Text fontFamily="$body" fontSize="$3" color="$destructiveColor">
                                {saveError}
                            </Text>
                        ) : null}
                    </YStack>

                    <YStack gap="$3">
                        <DetailFooterAction
                            label={isPending ? "Saving..." : "Save Display Name"}
                            onPress={() => {
                                void handleSave();
                            }}
                            accessibilityLabel="Save your display name"
                            tone="accent"
                            variant="filled"
                            disabled={!trimmedDisplayName || isPending}
                        />
                        <DetailFooterAction
                            label="Sign Out"
                            onPress={() => {
                                void signOut();
                            }}
                            accessibilityLabel="Sign out"
                            tone="danger"
                            variant="ghost"
                            disabled={isPending}
                        />
                    </YStack>
                </YStack>
            </PageContainer>
        </SafeAreaView>
    );
}
