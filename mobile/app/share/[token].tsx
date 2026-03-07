import React, { useCallback, useState } from "react";
import { ActivityIndicator } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { YStack, Text, ScrollView } from "tamagui";

import { useAuth } from "../../src/context/AuthContext";
import {
    useGetSharedPlan,
    useSubscribeViaShareLink,
} from "../../src/api/generated/sharing/sharing";
import type { SharedPlanResponseData } from "../../src/api/generated/model/sharedPlanResponseData";
import { PageContainer } from "../../src/components/PageContainer";
import { DetailFooterAction } from "../../src/components/DetailFooterAction";
import { PlanReadOnlyDetails } from "../../src/components/plans/PlanReadOnlyDetails";
import { getListPeopleQueryKey } from "../../src/api/generated/people/people";
import { getProblemDetail } from "../../src/lib/problemDetails";

export default function ShareTokenScreen() {
    const { token } = useLocalSearchParams<{ token: string }>();
    const { hasToken: isAuthenticated } = useAuth();
    const router = useRouter();
    const queryClient = useQueryClient();
    const [followError, setFollowError] = useState<string | null>(null);

    const { data: sharedResponse, isLoading, isError } = useGetSharedPlan(token!);
    const subscribe = useSubscribeViaShareLink();

    const plan: SharedPlanResponseData | null =
        sharedResponse?.data && "data" in sharedResponse.data
            ? (sharedResponse.data as { data: SharedPlanResponseData }).data
            : null;

    const refreshAfterSubscribe = useCallback(() => {
        void queryClient.invalidateQueries({ queryKey: ["/v1/plans"] });
        void queryClient.invalidateQueries({ queryKey: getListPeopleQueryKey() });
    }, [queryClient]);

    const goToPlans = useCallback(() => {
        void queryClient.invalidateQueries({ queryKey: ["/v1/plans"] });
        router.replace("/(main)/plans");
    }, [queryClient, router]);

    const goToSharedPlan = useCallback(() => {
        refreshAfterSubscribe();
        if (plan?.id) {
            router.replace(`/plan/${plan.id}` as any);
            return;
        }
        router.replace("/(main)/plans");
    }, [plan?.id, refreshAfterSubscribe, router]);

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
                <PageContainer backgroundColor="$background">
                    <YStack flex={1} justifyContent="center" alignItems="center">
                        <ActivityIndicator size="large" />
                    </YStack>
                </PageContainer>
            </SafeAreaView>
        );
    }

    if (isError || !plan) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: "#FBF8F3" }}>
                <PageContainer backgroundColor="$background">
                    <YStack
                        flex={1}
                        justifyContent="center"
                        alignItems="center"
                        padding="$8"
                        gap="$4"
                    >
                        <Text
                            fontFamily="$heading"
                            fontSize="$8"
                            color="$color"
                            textAlign="center"
                        >
                            Plan not found
                        </Text>
                        <Text
                            fontFamily="$body"
                            fontSize="$4"
                            color="$colorSecondary"
                            textAlign="center"
                        >
                            This share link may have been revoked or expired.
                        </Text>
                        <DetailFooterAction
                            label="Go to Plans"
                            onPress={goToPlans}
                            tone="accent"
                            variant="outline"
                            accessibilityLabel="Go to Plans"
                        />
                    </YStack>
                </PageContainer>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FBF8F3" }}>
            <PageContainer backgroundColor="$background">
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{
                        padding: 24,
                        paddingBottom: 48,
                    }}
                    showsVerticalScrollIndicator={false}
                >
                    <PlanReadOnlyDetails plan={plan} />

                    <YStack marginTop="$6" gap="$3">
                        {isAuthenticated ? (
                            <>
                                {followError ? (
                                    <Text
                                        fontFamily="$body"
                                        fontSize="$3"
                                        color="$destructiveColor"
                                        textAlign="center"
                                    >
                                        {followError}
                                    </Text>
                                ) : null}
                                <DetailFooterAction
                                    label={
                                        subscribe.isPending
                                            ? "Following..."
                                            : "Follow This Plan"
                                    }
                                    onPress={handleSubscribe}
                                    disabled={subscribe.isPending}
                                    tone="accent"
                                    variant="filled"
                                    labelSize="$5"
                                    accessibilityLabel="Follow this plan"
                                />
                                <DetailFooterAction
                                    label="Go to Plans"
                                    onPress={goToPlans}
                                    tone="neutral"
                                    variant="ghost"
                                    accessibilityLabel="Go to Plans"
                                />
                            </>
                        ) : (
                            <>
                                <Text
                                    fontFamily="$body"
                                    fontSize="$4"
                                    color="$colorSecondary"
                                    textAlign="center"
                                >
                                    Sign in to follow this plan and get updates.
                                </Text>
                                <DetailFooterAction
                                    label="Go to Plans"
                                    onPress={goToPlans}
                                    tone="accent"
                                    variant="outline"
                                    accessibilityLabel="Go to Plans"
                                />
                            </>
                        )}
                    </YStack>
                </ScrollView>
            </PageContainer>
        </SafeAreaView>
    );
}
