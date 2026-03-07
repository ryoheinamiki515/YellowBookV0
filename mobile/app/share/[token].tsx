import React, { useCallback, useState } from "react";
import { ActivityIndicator } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { YStack, XStack, Text, View, ScrollView } from "tamagui";

import { useAuth } from "../../src/context/AuthContext";
import {
    useGetSharedPlan,
    useSubscribeViaShareLink,
} from "../../src/api/generated/sharing/sharing";
import { getProblemDetail } from "../../src/lib/problemDetails";

function formatDate(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
    });
}

export default function ShareTokenScreen() {
    const { token } = useLocalSearchParams<{ token: string }>();
    const { hasToken: isAuthenticated } = useAuth();
    const router = useRouter();
    const queryClient = useQueryClient();
    const [followError, setFollowError] = useState<string | null>(null);

    const { data: sharedResponse, isLoading, isError } = useGetSharedPlan(token!);
    const subscribe = useSubscribeViaShareLink();

    const plan = sharedResponse?.data && "data" in sharedResponse.data
        ? (sharedResponse.data as { data: any }).data
        : null;

    const goToPlans = useCallback(() => {
        void queryClient.invalidateQueries({ queryKey: ["/v1/plans"] });
        router.replace("/(main)/plans");
    }, [queryClient, router]);

    const goToSharedPlan = useCallback(() => {
        void queryClient.invalidateQueries({ queryKey: ["/v1/plans"] });
        if (plan?.id) {
            router.replace(`/plan/${plan.id}` as any);
            return;
        }
        router.replace("/(main)/plans");
    }, [plan?.id, queryClient, router]);

    const handleSubscribe = useCallback(() => {
        if (!token) return;
        setFollowError(null);
        subscribe.mutate(
            { token },
            {
                onSuccess: () => {
                    goToSharedPlan();
                },
                onError: (error) => {
                    const detail = getProblemDetail(error);
                    if (
                        detail.includes("already_subscribed") ||
                        detail.includes("cannot_subscribe_to_own_plan")
                    ) {
                        goToSharedPlan();
                        return;
                    }

                    setFollowError("Couldn't follow this plan. Try again or go to Plans.");
                },
            }
        );
    }, [token, subscribe, goToSharedPlan]);

    if (isLoading) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: "#FBF8F3" }}>
                <YStack flex={1} justifyContent="center" alignItems="center">
                    <ActivityIndicator size="large" />
                </YStack>
            </SafeAreaView>
        );
    }

    if (isError || !plan) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: "#FBF8F3" }}>
                <YStack flex={1} justifyContent="center" alignItems="center" padding="$8">
                    <Text fontFamily="$heading" fontSize="$8" color="$color" textAlign="center" marginBottom="$3">
                        Plan not found
                    </Text>
                    <Text fontFamily="$body" fontSize="$4" color="$colorSecondary" textAlign="center" marginBottom="$6">
                        This share link may have been revoked or expired.
                    </Text>
                    <Text
                        fontFamily="$body"
                        fontSize="$4"
                        color="$accentColor"
                        onPress={goToPlans}
                        pressStyle={{ opacity: 0.7 }}
                        cursor="pointer"
                    >
                        Go to Plans
                    </Text>
                </YStack>
            </SafeAreaView>
        );
    }

    const dateLabel = formatDate(plan.anchorStart);
    const participants = (plan.participants ?? []) as { displayName?: string | null }[];
    const participantNames = participants
        .map((p) => p.displayName)
        .filter(Boolean) as string[];

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FBF8F3" }}>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: 24, paddingBottom: 48 }}
            >
                {plan.ownerDisplayName ? (
                    <Text
                        fontFamily="$body"
                        fontSize="$3"
                        color="$colorSecondary"
                        marginBottom="$2"
                    >
                        Shared by {plan.ownerDisplayName}
                    </Text>
                ) : null}

                <Text
                    fontFamily="$heading"
                    fontSize="$9"
                    color="$color"
                    marginBottom="$4"
                >
                    {plan.intentText}
                </Text>

                {dateLabel ? (
                    <XStack alignItems="center" gap="$2" marginBottom="$3">
                        <View
                            paddingHorizontal="$2.5"
                            paddingVertical="$1"
                            borderRadius="$4"
                            backgroundColor="$backgroundStrong"
                        >
                            <Text
                                fontFamily="$body"
                                fontSize="$2"
                                fontWeight="500"
                                color="$colorSecondary"
                            >
                                {dateLabel}
                            </Text>
                        </View>
                    </XStack>
                ) : null}

                {plan.locationText ? (
                    <Text
                        fontFamily="$body"
                        fontSize="$4"
                        color="$colorSecondary"
                        marginBottom="$3"
                    >
                        at {plan.locationText}
                    </Text>
                ) : null}

                {participantNames.length > 0 ? (
                    <YStack marginBottom="$4">
                        <Text
                            fontFamily="$body"
                            fontSize="$3"
                            fontWeight="600"
                            color="$colorSecondary"
                            marginBottom="$2"
                        >
                            People
                        </Text>
                        {participantNames.map((name, i) => (
                            <Text
                                key={i}
                                fontFamily="$body"
                                fontSize="$4"
                                color="$color"
                                marginBottom="$1"
                            >
                                {name}
                            </Text>
                        ))}
                    </YStack>
                ) : null}

                {isAuthenticated ? (
                    <YStack marginTop="$6">
                        <YStack
                            height={48}
                            borderRadius="$6"
                            backgroundColor="$accentBackground"
                            justifyContent="center"
                            alignItems="center"
                            onPress={handleSubscribe}
                            disabled={subscribe.isPending}
                            opacity={subscribe.isPending ? 0.6 : 1}
                            pressStyle={{
                                scale: 0.96,
                                backgroundColor: "$accentBackgroundPress",
                            }}
                            cursor="pointer"
                            accessibilityRole="button"
                            accessibilityLabel="Follow this plan"
                        >
                            <Text
                                fontFamily="$body"
                                fontSize="$4"
                                fontWeight="600"
                                color="$accentColor"
                            >
                                {subscribe.isPending
                                    ? "Following..."
                                    : "Follow This Plan"}
                            </Text>
                        </YStack>
                        {followError ? (
                            <Text
                                fontFamily="$body"
                                fontSize="$3"
                                color="$colorSecondary"
                                textAlign="center"
                                marginTop="$3"
                            >
                                {followError}
                            </Text>
                        ) : null}
                        <Text
                            fontFamily="$body"
                            fontSize="$4"
                            color="$accentColor"
                            textAlign="center"
                            marginTop="$4"
                            onPress={goToPlans}
                            pressStyle={{ opacity: 0.7 }}
                            cursor="pointer"
                        >
                            Go to Plans
                        </Text>
                    </YStack>
                ) : (
                    <YStack marginTop="$6" alignItems="center">
                        <Text
                            fontFamily="$body"
                            fontSize="$4"
                            color="$colorSecondary"
                            textAlign="center"
                        >
                            Sign in to follow this plan and get updates.
                        </Text>
                        <Text
                            fontFamily="$body"
                            fontSize="$4"
                            color="$accentColor"
                            textAlign="center"
                            marginTop="$4"
                            onPress={goToPlans}
                            pressStyle={{ opacity: 0.7 }}
                            cursor="pointer"
                        >
                            Go to Plans
                        </Text>
                    </YStack>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}
