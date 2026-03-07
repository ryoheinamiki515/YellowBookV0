import React, { useEffect, useState } from "react";
import { ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { YStack, Text } from "tamagui";

import { useAuth } from "../../src/context/AuthContext";
import { useAcceptConnectionInvite } from "../../src/api/generated/connections/connections";
import { getProblemDetail } from "../../src/lib/problemDetails";

export default function InviteTokenScreen() {
    const { token } = useLocalSearchParams<{ token: string }>();
    const { hasToken: isAuthenticated } = useAuth();
    const router = useRouter();
    const acceptInvite = useAcceptConnectionInvite();
    const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
    const [errorMessage, setErrorMessage] = useState("");

    useEffect(() => {
        if (!isAuthenticated || !token) return;

        acceptInvite.mutate(
            { token },
            {
                onSuccess: () => {
                    setStatus("success");
                    setTimeout(() => router.replace("/(main)/connections"), 1500);
                },
                onError: (error: any) => {
                    const detail = getProblemDetail(error);
                    if (detail.includes("display_name_required")) {
                        router.replace("/complete-profile");
                        return;
                    }

                    setStatus("error");
                    if (detail.includes("already_connected")) {
                        setErrorMessage("You're already connected!");
                    } else if (detail.includes("cannot_accept_own")) {
                        setErrorMessage("You can't accept your own invite.");
                    } else {
                        setErrorMessage("This invite link is invalid or expired.");
                    }
                },
            }
        );
    }, [acceptInvite, isAuthenticated, router, token]);

    if (!isAuthenticated) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: "#FBF8F3" }}>
                <YStack flex={1} justifyContent="center" alignItems="center" padding="$8">
                    <Text fontFamily="$heading" fontSize="$8" color="$color" textAlign="center" marginBottom="$3">
                        Sign in to connect
                    </Text>
                    <Text fontFamily="$body" fontSize="$4" color="$colorSecondary" textAlign="center">
                        You need to sign in to accept this connection invite.
                    </Text>
                </YStack>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FBF8F3" }}>
            <YStack flex={1} justifyContent="center" alignItems="center" padding="$8">
                {status === "loading" && (
                    <>
                        <ActivityIndicator size="large" />
                        <Text fontFamily="$body" fontSize="$4" color="$colorSecondary" marginTop="$4">
                            Connecting...
                        </Text>
                    </>
                )}
                {status === "success" && (
                    <>
                        <Text fontFamily="$heading" fontSize="$9" color="$color" textAlign="center">
                            Connected!
                        </Text>
                        <Text fontFamily="$body" fontSize="$4" color="$colorSecondary" marginTop="$2">
                            Redirecting to your connections...
                        </Text>
                    </>
                )}
                {status === "error" && (
                    <>
                        <Text fontFamily="$heading" fontSize="$8" color="$color" textAlign="center" marginBottom="$3">
                            Couldn't connect
                        </Text>
                        <Text fontFamily="$body" fontSize="$4" color="$colorSecondary" textAlign="center" marginBottom="$6">
                            {errorMessage}
                        </Text>
                        <Text
                            fontFamily="$body"
                            fontSize="$4"
                            color="$accentColor"
                            onPress={() => router.replace("/(main)/plans")}
                            pressStyle={{ opacity: 0.7 }}
                            cursor="pointer"
                        >
                            Go to Plans
                        </Text>
                    </>
                )}
            </YStack>
        </SafeAreaView>
    );
}
